import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

import { scanRoot, stopWatching, watchWorkspace } from "../workspace/workspaceApi";
import type { MountConfig } from "../workspace/workspaceConfig";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import {
  createFolder,
  createMarkdown,
  deleteToTrash,
  movePath,
  renamePath,
} from "./fileApi";
import type { FileTreeNode } from "./fileTypes";
import { FileTree } from "./FileTree";

vi.mock("./fileApi", () => ({
  createFolder: vi.fn(),
  createMarkdown: vi.fn(),
  renamePath: vi.fn(),
  movePath: vi.fn(),
  deleteToTrash: vi.fn(),
}));

vi.mock("../workspace/workspaceApi", () => ({
  createWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  listRecentWorkspaces: vi.fn(),
  scanRoot: vi.fn(),
  stopWatching: vi.fn(),
  watchWorkspace: vi.fn(),
}));

const createFolderMock = vi.mocked(createFolder);
const createMarkdownMock = vi.mocked(createMarkdown);
const renamePathMock = vi.mocked(renamePath);
const movePathMock = vi.mocked(movePath);
const deleteToTrashMock = vi.mocked(deleteToTrash);
const scanRootMock = vi.mocked(scanRoot);
const stopWatchingMock = vi.mocked(stopWatching);
const watchWorkspaceMock = vi.mocked(watchWorkspace);

const workspaceTree: FileTreeNode[] = [
  {
    name: "notes",
    path: "C:\\workspace\\notes",
    kind: "directory",
    children: [
      {
        name: "daily",
        path: "C:\\workspace\\notes\\daily",
        kind: "directory",
        children: [
          {
            name: "2026-01-01.md",
            path: "C:\\workspace\\notes\\daily\\2026-01-01.md",
            kind: "markdown",
          },
        ],
      },
      { name: "intro.md", path: "C:\\workspace\\notes\\intro.md", kind: "markdown" },
    ],
  },
  { name: "scratch.md", path: "C:\\workspace\\scratch.md", kind: "markdown" },
];

const docsTree: FileTreeNode[] = [
  { name: "handbook.md", path: "D:\\docs\\handbook.md", kind: "markdown" },
];

const archiveTree: FileTreeNode[] = [
  { name: "secret.md", path: "E:\\archive\\secret.md", kind: "markdown" },
];

const mounts: MountConfig[] = [
  { path: "C:\\workspace", permission: "read-write" },
  { path: "D:\\docs", permission: "read-only" },
  { path: "E:\\archive", permission: "excluded" },
];

function renderTree(onOpenMarkdown = vi.fn()) {
  render(
    <FileTree
      mounts={mounts}
      treeByMount={{
        "C:\\workspace": workspaceTree,
        "D:\\docs": docsTree,
        "E:\\archive": archiveTree,
      }}
      onOpenMarkdown={onOpenMarkdown}
    />,
  );
  return onOpenMarkdown;
}

function StoreBackedFileTree({ mountsOverride = mounts }: { mountsOverride?: MountConfig[] }) {
  const treeByMount = useWorkspaceStore((state) => state.treeByMount);
  return <FileTree mounts={mountsOverride} treeByMount={treeByMount} onOpenMarkdown={vi.fn()} />;
}

function setStore(
  treeByMount: Record<string, FileTreeNode[]>,
  mountList: MountConfig[] = mounts,
) {
  useWorkspaceStore.setState({
    workspace: { schemaVersion: 1, id: "ws-1", name: "Personal", mounts: mountList },
    treeByMount,
    error: null,
  });
}

beforeEach(() => {
  createFolderMock.mockReset();
  createMarkdownMock.mockReset();
  renamePathMock.mockReset();
  movePathMock.mockReset();
  deleteToTrashMock.mockReset();
  scanRootMock.mockReset();
  stopWatchingMock.mockReset();
  stopWatchingMock.mockResolvedValue(undefined);
  watchWorkspaceMock.mockReset();
  watchWorkspaceMock.mockResolvedValue(1);
  useWorkspaceStore.setState({ workspace: null, treeByMount: {}, error: null });
});

test("renders nested directories once expanded", async () => {
  const user = userEvent.setup();
  renderTree();

  await user.click(screen.getByRole("treeitem", { name: "notes" }));

  expect(screen.getByRole("treeitem", { name: "daily" })).toBeInTheDocument();

  await user.click(screen.getByRole("treeitem", { name: "daily" }));

  expect(screen.getByRole("treeitem", { name: "2026-01-01.md" })).toBeInTheDocument();
});

test("renders markdown files as tree items", () => {
  renderTree();

  expect(screen.getByRole("treeitem", { name: "scratch.md" })).toBeInTheDocument();
});

test("expands and collapses directories on click", async () => {
  const user = userEvent.setup();
  renderTree();

  const notes = screen.getByRole("treeitem", { name: "notes" });

  expect(notes).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("treeitem", { name: "intro.md" })).not.toBeInTheDocument();

  await user.click(notes);

  expect(notes).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("treeitem", { name: "intro.md" })).toBeInTheDocument();

  await user.click(notes);

  expect(notes).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("treeitem", { name: "intro.md" })).not.toBeInTheDocument();
});

test("clicking a markdown file emits its exact full path", async () => {
  const user = userEvent.setup();
  const onOpenMarkdown = renderTree();

  await user.click(screen.getByRole("treeitem", { name: "scratch.md" }));

  expect(onOpenMarkdown).toHaveBeenCalledTimes(1);
  expect(onOpenMarkdown).toHaveBeenCalledWith("C:\\workspace\\scratch.md");
});

test("clicking a directory does not emit the file-open callback", async () => {
  const user = userEvent.setup();
  const onOpenMarkdown = renderTree();

  await user.click(screen.getByRole("treeitem", { name: "notes" }));

  expect(onOpenMarkdown).not.toHaveBeenCalled();
});

test("Enter key toggles a directory and opens a file", async () => {
  const user = userEvent.setup();
  const onOpenMarkdown = renderTree();

  const notes = screen.getByRole("treeitem", { name: "notes" });
  notes.focus();
  await user.keyboard("{Enter}");

  expect(notes).toHaveAttribute("aria-expanded", "true");
  expect(onOpenMarkdown).not.toHaveBeenCalled();

  const intro = screen.getByRole("treeitem", { name: "intro.md" });
  intro.focus();
  await user.keyboard("{Enter}");

  expect(onOpenMarkdown).toHaveBeenCalledTimes(1);
  expect(onOpenMarkdown).toHaveBeenCalledWith("C:\\workspace\\notes\\intro.md");
});

test("read-only mounts render a header with an accessible read-only marker", () => {
  renderTree();

  expect(screen.getByRole("heading", { name: "D:\\docs" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "read-only" })).toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: "handbook.md" })).toBeInTheDocument();
});

test("excluded mounts render no header and no items", () => {
  renderTree();

  expect(screen.queryByRole("heading", { name: "E:\\archive" })).not.toBeInTheDocument();
  expect(screen.queryByRole("treeitem", { name: "secret.md" })).not.toBeInTheDocument();
  expect(screen.queryByText("secret.md")).not.toBeInTheDocument();
  expect(screen.queryByText("excluded")).not.toBeInTheDocument();
});

test("two mounts render under distinct headers and files emit their exact paths", async () => {
  const user = userEvent.setup();
  const onOpenMarkdown = renderTree();

  expect(screen.getByRole("heading", { name: "C:\\workspace" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "D:\\docs" })).toBeInTheDocument();

  await user.click(screen.getByRole("treeitem", { name: "handbook.md" }));

  expect(onOpenMarkdown).toHaveBeenCalledTimes(1);
  expect(onOpenMarkdown).toHaveBeenCalledWith("D:\\docs\\handbook.md");

  await user.click(screen.getByRole("treeitem", { name: "scratch.md" }));

  expect(onOpenMarkdown).toHaveBeenCalledTimes(2);
  expect(onOpenMarkdown).toHaveBeenLastCalledWith("C:\\workspace\\scratch.md");
});

test("mount headers show a shortened path while keeping the full path accessible", () => {
  render(
    <FileTree
      mounts={[
        {
          path: "C:\\Users\\LJT\\Documents\\SomeVeryLongFolderName\\Notes",
          permission: "read-write",
        },
      ]}
      treeByMount={{
        "C:\\Users\\LJT\\Documents\\SomeVeryLongFolderName\\Notes": workspaceTree,
      }}
      onOpenMarkdown={vi.fn()}
    />,
  );

  const header = screen.getByTitle("C:\\Users\\LJT\\Documents\\SomeVeryLongFolderName\\Notes");

  expect(header).toHaveTextContent("…");
  expect(header.textContent).not.toBe("C:\\Users\\LJT\\Documents\\SomeVeryLongFolderName\\Notes");
});

test("creating a markdown file through the directory menu updates the tree with exact args", async () => {
  const user = userEvent.setup();
  setStore({
    "C:\\workspace": [
      { name: "notes", path: "C:\\workspace\\notes", kind: "directory", children: [] },
    ],
    "D:\\docs": docsTree,
  });
  createMarkdownMock.mockResolvedValue("C:\\workspace\\notes\\idea.md");
  scanRootMock
    .mockResolvedValueOnce([
      {
        name: "notes",
        path: "C:\\workspace\\notes",
        kind: "directory",
        children: [{ name: "idea.md", path: "C:\\workspace\\notes\\idea.md", kind: "markdown" }],
      },
    ])
    .mockResolvedValue(docsTree);

  render(<StoreBackedFileTree />);

  await user.click(screen.getByRole("treeitem", { name: "notes" }));
  await user.click(screen.getByRole("button", { name: "Actions for notes" }));
  await user.click(screen.getByRole("menuitem", { name: "New Markdown" }));

  expect(screen.getByRole("dialog", { name: "New markdown" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("Name"), "idea");
  await user.click(screen.getByRole("button", { name: "Create" }));

  await waitFor(() =>
    expect(screen.getByRole("treeitem", { name: "idea.md" })).toBeInTheDocument(),
  );
  expect(createMarkdownMock).toHaveBeenCalledWith("ws-1", "C:\\workspace\\notes", "idea.md");
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("renaming a file through the item menu updates the tree with exact args", async () => {
  const user = userEvent.setup();
  setStore({
    "C:\\workspace": [{ name: "a.md", path: "C:\\workspace\\a.md", kind: "markdown" }],
    "D:\\docs": docsTree,
  });
  renamePathMock.mockResolvedValue("C:\\workspace\\b.md");
  scanRootMock
    .mockResolvedValueOnce([{ name: "b.md", path: "C:\\workspace\\b.md", kind: "markdown" }])
    .mockResolvedValue(docsTree);

  render(<StoreBackedFileTree />);

  await user.click(screen.getByRole("button", { name: "Actions for a.md" }));
  await user.click(screen.getByRole("menuitem", { name: "Rename" }));

  const input = screen.getByLabelText("New name");
  await user.clear(input);
  await user.type(input, "b.md");
  await user.click(screen.getByRole("button", { name: "Rename" }));

  await waitFor(() =>
    expect(screen.getByRole("treeitem", { name: "b.md" })).toBeInTheDocument(),
  );
  expect(screen.queryByRole("treeitem", { name: "a.md" })).not.toBeInTheDocument();
  expect(renamePathMock).toHaveBeenCalledWith("ws-1", "C:\\workspace\\a.md", "b.md");
});

test("confirming delete moves the file to trash and removes it from the tree", async () => {
  const user = userEvent.setup();
  setStore({
    "C:\\workspace": [
      { name: "a.md", path: "C:\\workspace\\a.md", kind: "markdown" },
      { name: "b.md", path: "C:\\workspace\\b.md", kind: "markdown" },
    ],
    "D:\\docs": docsTree,
  });
  deleteToTrashMock.mockResolvedValue(undefined);
  scanRootMock
    .mockResolvedValueOnce([{ name: "b.md", path: "C:\\workspace\\b.md", kind: "markdown" }])
    .mockResolvedValue(docsTree);

  render(<StoreBackedFileTree />);

  await user.click(screen.getByRole("button", { name: "Actions for a.md" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete" }));

  expect(screen.getByRole("dialog", { name: "Delete to trash" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Move to Trash" }));

  await waitFor(() =>
    expect(screen.queryByRole("treeitem", { name: "a.md" })).not.toBeInTheDocument(),
  );
  expect(deleteToTrashMock).toHaveBeenCalledWith("ws-1", "C:\\workspace\\a.md");
});

test("cancelling delete keeps the file and does not call the trash wrapper", async () => {
  const user = userEvent.setup();
  setStore({
    "C:\\workspace": [{ name: "a.md", path: "C:\\workspace\\a.md", kind: "markdown" }],
    "D:\\docs": docsTree,
  });

  render(<StoreBackedFileTree />);

  await user.click(screen.getByRole("button", { name: "Actions for a.md" }));
  await user.click(screen.getByRole("menuitem", { name: "Delete" }));

  await user.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: "a.md" })).toBeInTheDocument();
  expect(deleteToTrashMock).not.toHaveBeenCalled();
});

test("read-only mounts offer no file-operation actions", () => {
  renderTree();

  expect(screen.queryByRole("button", { name: "Actions for handbook.md" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Actions for D:\\docs" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Actions for notes" })).toBeInTheDocument();
});

test("cutting then pasting a file moves it within the same mount", async () => {
  const user = userEvent.setup();
  setStore({
    "C:\\workspace": [
      {
        name: "notes",
        path: "C:\\workspace\\notes",
        kind: "directory",
        children: [{ name: "a.md", path: "C:\\workspace\\notes\\a.md", kind: "markdown" }],
      },
      { name: "archive", path: "C:\\workspace\\archive", kind: "directory", children: [] },
    ],
    "D:\\docs": docsTree,
  });
  movePathMock.mockResolvedValue("C:\\workspace\\archive\\a.md");
  scanRootMock
    .mockResolvedValueOnce([
      { name: "notes", path: "C:\\workspace\\notes", kind: "directory", children: [] },
      {
        name: "archive",
        path: "C:\\workspace\\archive",
        kind: "directory",
        children: [{ name: "a.md", path: "C:\\workspace\\archive\\a.md", kind: "markdown" }],
      },
    ])
    .mockResolvedValue(docsTree);

  render(<StoreBackedFileTree />);

  await user.click(screen.getByRole("treeitem", { name: "notes" }));
  await user.click(screen.getByRole("button", { name: "Actions for a.md" }));
  await user.click(screen.getByRole("menuitem", { name: "Cut" }));
  await user.click(screen.getByRole("button", { name: "Actions for archive" }));
  await user.click(screen.getByRole("menuitem", { name: "Paste" }));

  await waitFor(() =>
    expect(useWorkspaceStore.getState().treeByMount["C:\\workspace"]).toEqual([
      { name: "notes", path: "C:\\workspace\\notes", kind: "directory", children: [] },
      {
        name: "archive",
        path: "C:\\workspace\\archive",
        kind: "directory",
        children: [{ name: "a.md", path: "C:\\workspace\\archive\\a.md", kind: "markdown" }],
      },
    ]),
  );
  expect(movePathMock).toHaveBeenCalledWith(
    "ws-1",
    "C:\\workspace\\notes\\a.md",
    "C:\\workspace\\archive",
  );
});

test("paste is not offered when the cut item belongs to another mount", async () => {
  const user = userEvent.setup();
  const rwMounts: MountConfig[] = [
    { path: "C:\\workspace", permission: "read-write" },
    { path: "D:\\vault", permission: "read-write" },
  ];
  setStore(
    {
      "C:\\workspace": [
        { name: "notes", path: "C:\\workspace\\notes", kind: "directory", children: [] },
      ],
      "D:\\vault": [{ name: "handbook.md", path: "D:\\vault\\handbook.md", kind: "markdown" }],
    },
    rwMounts,
  );

  render(<StoreBackedFileTree mountsOverride={rwMounts} />);

  await user.click(screen.getByRole("button", { name: "Actions for handbook.md" }));
  await user.click(screen.getByRole("menuitem", { name: "Cut" }));

  await user.click(screen.getByRole("button", { name: "Actions for notes" }));

  expect(screen.queryByRole("menuitem", { name: "Paste" })).not.toBeInTheDocument();
  expect(movePathMock).not.toHaveBeenCalled();
});
