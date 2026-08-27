import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import type { MountConfig } from "../workspace/workspaceConfig";
import type { FileTreeNode } from "./fileTypes";
import { FileTree } from "./FileTree";

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
