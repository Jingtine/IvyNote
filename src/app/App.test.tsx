import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";

import { App } from "./App";
import { readMarkdownFile, saveMarkdownDocument } from "../features/files/fileApi";
import type {
  FileTreeNode,
  SaveTextDocumentResult,
  TextDocumentSnapshot,
} from "../features/files/fileTypes";
import { useEditorStore } from "../features/editor/editorStore";
import {
  createWorkspace,
  listRecentWorkspaces,
  listWorkspaces,
  openWorkspace,
  scanRoot,
} from "../features/workspace/workspaceApi";
import { useWorkspaceStore } from "../features/workspace/workspaceStore";

vi.mock("../features/files/fileApi", () => ({
  readMarkdownFile: vi.fn(),
  saveMarkdownDocument: vi.fn(),
}));

vi.mock("../features/workspace/workspaceApi", () => ({
  createWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  listRecentWorkspaces: vi.fn(),
  scanRoot: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

const readMarkdownFileMock = vi.mocked(readMarkdownFile);
const saveMarkdownDocumentMock = vi.mocked(saveMarkdownDocument);
const scanRootMock = vi.mocked(scanRoot);
const createWorkspaceApiMock = vi.mocked(createWorkspace);
const openWorkspaceApiMock = vi.mocked(openWorkspace);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const listRecentWorkspacesMock = vi.mocked(listRecentWorkspaces);
const dialogOpenMock = vi.mocked(open);

const A_PATH = "C:\\notes\\a.md";
const B_PATH = "C:\\notes\\b.md";

const tree: FileTreeNode[] = [
  { name: "a.md", path: A_PATH, kind: "markdown" },
  { name: "b.md", path: B_PATH, kind: "markdown" },
];

function snapshot(path: string, content: string): TextDocumentSnapshot {
  return {
    path,
    content,
    modifiedAtMs: 1_700_000_000_000,
    size: content.length,
    newline: "lf",
    hasUtf8Bom: false,
  };
}

function conflictError(): { code: string; message: string; path: string } {
  return {
    code: "externalModificationConflict",
    message: "File was modified externally: C:\\notes\\a.md",
    path: A_PATH,
  };
}

/** Clicks a.md, waits for it to load, then marks the draft dirty. */
async function openDirtyA(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("treeitem", { name: "a.md" }));
  await waitFor(() => expect(useEditorStore.getState().document?.path).toBe(A_PATH));

  act(() => {
    useEditorStore.getState().setDraft("# A edited\n");
  });
  expect(useEditorStore.getState().dirty).toBe(true);
}

beforeAll(() => {
  // jsdom does not implement Range#getClientRects; CodeMirror's measure pass calls it.
  if (typeof Range.prototype.getClientRects !== "function") {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
});

beforeEach(() => {
  readMarkdownFileMock.mockReset();
  saveMarkdownDocumentMock.mockReset();
  scanRootMock.mockReset();
  createWorkspaceApiMock.mockReset();
  openWorkspaceApiMock.mockReset();
  listWorkspacesMock.mockReset();
  listRecentWorkspacesMock.mockReset();
  dialogOpenMock.mockReset();
  readMarkdownFileMock.mockImplementation(async (path: string) => snapshot(path, `# ${path}\n`));
  listWorkspacesMock.mockResolvedValue([]);
  listRecentWorkspacesMock.mockResolvedValue([]);
  useEditorStore.setState({
    document: null,
    draft: "",
    dirty: false,
    loading: false,
    saving: false,
    conflict: false,
    error: null,
    pendingPath: null,
    fileMissing: false,
  });
  useWorkspaceStore.setState({
    workspace: {
      schemaVersion: 1,
      id: "ws-1",
      name: "Personal",
      mounts: [{ path: "C:\\notes", permission: "read-write" }],
    },
    treeByMount: { "C:\\notes": tree },
    error: null,
  });
});

test("renders the Local Knowledge IDE shell", () => {
  useWorkspaceStore.setState({ workspace: null, treeByMount: {}, error: null });
  render(<App />);
  expect(screen.getByRole("application", { name: "Local Knowledge IDE" })).toBeInTheDocument();
  expect(screen.getByText(/No workspace selected/)).toBeInTheDocument();
});

test("renders the load error when the first document load fails without an open document", async () => {
  readMarkdownFileMock.mockRejectedValueOnce(new Error("read failed"));
  render(<App />);

  await act(async () => {
    await useEditorStore.getState().loadDocument("C:\\notes\\missing.md");
  });

  expect(screen.getByText("No document open. Select a Markdown file.")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("read failed");
});

test("clicking another file with unsaved changes shows the dialog instead of discarding the draft", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);

  await user.click(screen.getByRole("treeitem", { name: "b.md" }));

  expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
  expect(useEditorStore.getState().document?.path).toBe(A_PATH);
  expect(useEditorStore.getState().draft).toBe("# A edited\n");
  expect(useEditorStore.getState().dirty).toBe(true);
  expect(readMarkdownFileMock).toHaveBeenCalledTimes(1);
});

test("Save and Open saves the draft and then opens the target file", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);
  saveMarkdownDocumentMock.mockResolvedValue({ modifiedAtMs: 1_700_000_000_500, size: 11 });

  await user.click(screen.getByRole("treeitem", { name: "b.md" }));
  await user.click(screen.getByRole("button", { name: "Save and Open" }));

  await waitFor(() => expect(useEditorStore.getState().document?.path).toBe(B_PATH));
  expect(saveMarkdownDocumentMock).toHaveBeenCalledTimes(1);
  expect(saveMarkdownDocumentMock).toHaveBeenCalledWith(
    expect.objectContaining({ path: A_PATH, content: "# A edited\n" }),
  );
  expect(useEditorStore.getState().dirty).toBe(false);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("Save and Open keeps the draft on the current file when saving fails", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);
  saveMarkdownDocumentMock.mockRejectedValue(new Error("disk full"));

  await user.click(screen.getByRole("treeitem", { name: "b.md" }));
  await user.click(screen.getByRole("button", { name: "Save and Open" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(useEditorStore.getState().document?.path).toBe(A_PATH);
  expect(useEditorStore.getState().draft).toBe("# A edited\n");
  expect(useEditorStore.getState().dirty).toBe(true);
  expect(readMarkdownFileMock).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("alert")).toHaveTextContent("disk full");
});

test("Save and Open keeps the draft when saving hits an external modification conflict", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);
  saveMarkdownDocumentMock.mockRejectedValue(conflictError());

  await user.click(screen.getByRole("treeitem", { name: "b.md" }));
  await user.click(screen.getByRole("button", { name: "Save and Open" }));

  await waitFor(() => expect(useEditorStore.getState().conflict).toBe(true));
  expect(useEditorStore.getState().document?.path).toBe(A_PATH);
  expect(useEditorStore.getState().draft).toBe("# A edited\n");
  expect(useEditorStore.getState().dirty).toBe(true);
  expect(readMarkdownFileMock).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("Discard and Open loads the target file without saving", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);

  await user.click(screen.getByRole("treeitem", { name: "b.md" }));
  await user.click(screen.getByRole("button", { name: "Discard and Open" }));

  await waitFor(() => expect(useEditorStore.getState().document?.path).toBe(B_PATH));
  expect(saveMarkdownDocumentMock).not.toHaveBeenCalled();
  expect(useEditorStore.getState().dirty).toBe(false);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("Cancel keeps the current document and the draft", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);

  await user.click(screen.getByRole("treeitem", { name: "b.md" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(useEditorStore.getState().document?.path).toBe(A_PATH);
  expect(useEditorStore.getState().draft).toBe("# A edited\n");
  expect(useEditorStore.getState().dirty).toBe(true);
});

test("switching files with no unsaved changes opens the target immediately without a dialog", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("treeitem", { name: "a.md" }));
  await waitFor(() => expect(useEditorStore.getState().document?.path).toBe(A_PATH));

  await user.click(screen.getByRole("treeitem", { name: "b.md" }));

  await waitFor(() => expect(useEditorStore.getState().document?.path).toBe(B_PATH));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(saveMarkdownDocumentMock).not.toHaveBeenCalled();
});

test("clicking the already-open dirty file is a no-op that preserves the draft", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);

  await user.click(screen.getByRole("treeitem", { name: "a.md" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(useEditorStore.getState().document?.path).toBe(A_PATH);
  expect(useEditorStore.getState().draft).toBe("# A edited\n");
  expect(useEditorStore.getState().dirty).toBe(true);
  expect(readMarkdownFileMock).toHaveBeenCalledTimes(1);
});

test("Refresh rescans the workspace and shows the updated tree", async () => {
  const user = userEvent.setup();
  render(<App />);
  scanRootMock.mockResolvedValue([{ name: "c.md", path: "C:\\notes\\c.md", kind: "markdown" }]);

  await user.click(screen.getByRole("button", { name: "Refresh" }));

  await waitFor(() => expect(screen.getByRole("treeitem", { name: "c.md" })).toBeInTheDocument());
  expect(screen.queryByRole("treeitem", { name: "a.md" })).not.toBeInTheDocument();
  expect(useWorkspaceStore.getState().treeByMount["C:\\notes"]).toEqual([
    { name: "c.md", path: "C:\\notes\\c.md", kind: "markdown" },
  ]);
});

test("refresh that removes the open clean file shows missing state without closing it", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("treeitem", { name: "a.md" }));
  await waitFor(() => expect(useEditorStore.getState().document?.path).toBe(A_PATH));
  scanRootMock.mockResolvedValue([{ name: "b.md", path: B_PATH, kind: "markdown" }]);

  await user.click(screen.getByRole("button", { name: "Refresh" }));

  await waitFor(() => expect(useEditorStore.getState().fileMissing).toBe(true));
  expect(screen.getByRole("status")).toHaveTextContent(
    "This file is missing on disk. Saving is disabled.",
  );
  expect(useEditorStore.getState().document?.path).toBe(A_PATH);
  expect(useEditorStore.getState().draft).toBe(`# ${A_PATH}\n`);
  expect(useEditorStore.getState().dirty).toBe(false);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  expect(saveMarkdownDocumentMock).not.toHaveBeenCalled();
});

test("refresh that removes the open dirty file preserves the draft and blocks saving", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);
  scanRootMock.mockResolvedValue([{ name: "b.md", path: B_PATH, kind: "markdown" }]);

  await user.click(screen.getByRole("button", { name: "Refresh" }));

  await waitFor(() => expect(useEditorStore.getState().fileMissing).toBe(true));
  expect(useEditorStore.getState().draft).toBe("# A edited\n");
  expect(useEditorStore.getState().dirty).toBe(true);
  expect(useEditorStore.getState().document?.path).toBe(A_PATH);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

  fireEvent.keyDown(window, { key: "s", code: "KeyS", ctrlKey: true });

  expect(saveMarkdownDocumentMock).not.toHaveBeenCalled();
  expect(useEditorStore.getState().draft).toBe("# A edited\n");
});

test("missing file state clears after the file reappears in a refreshed tree", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("treeitem", { name: "a.md" }));
  await waitFor(() => expect(useEditorStore.getState().document?.path).toBe(A_PATH));
  scanRootMock.mockResolvedValue([{ name: "b.md", path: B_PATH, kind: "markdown" }]);
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(useEditorStore.getState().fileMissing).toBe(true));

  scanRootMock.mockResolvedValue(tree);
  await user.click(screen.getByRole("button", { name: "Refresh" }));

  await waitFor(() => expect(useEditorStore.getState().fileMissing).toBe(false));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(useEditorStore.getState().document?.path).toBe(A_PATH);
});

test("Save and Open keeps the dialog open with an alert when the file is missing on disk", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);
  scanRootMock.mockResolvedValue([{ name: "b.md", path: B_PATH, kind: "markdown" }]);
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  await waitFor(() => expect(useEditorStore.getState().fileMissing).toBe(true));

  await user.click(screen.getByRole("treeitem", { name: "b.md" }));
  await user.click(screen.getByRole("button", { name: "Save and Open" }));

  expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("missing on disk");
  expect(useEditorStore.getState().document?.path).toBe(A_PATH);
  expect(useEditorStore.getState().draft).toBe("# A edited\n");
  expect(useEditorStore.getState().dirty).toBe(true);
  expect(saveMarkdownDocumentMock).not.toHaveBeenCalled();
  expect(readMarkdownFileMock).toHaveBeenCalledTimes(1);
});

test("Save and Open joins an in-flight save and still opens the target", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);
  let resolveSave!: (result: SaveTextDocumentResult) => void;
  saveMarkdownDocumentMock.mockImplementation(
    () =>
      new Promise<SaveTextDocumentResult>((resolve) => {
        resolveSave = resolve;
      }),
  );

  act(() => {
    void useEditorStore.getState().save();
  });
  await waitFor(() => expect(useEditorStore.getState().saving).toBe(true));

  await user.click(screen.getByRole("treeitem", { name: "b.md" }));
  expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Save and Open" }));

  act(() => {
    resolveSave({ modifiedAtMs: 1_700_000_000_500, size: 11 });
  });

  await waitFor(() => expect(useEditorStore.getState().document?.path).toBe(B_PATH));
  expect(saveMarkdownDocumentMock).toHaveBeenCalledTimes(1);
  expect(useEditorStore.getState().pendingPath).toBeNull();
  expect(useEditorStore.getState().dirty).toBe(false);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("refresh failure shows the workspace error in an alert near the Refresh button", async () => {
  const user = userEvent.setup();
  render(<App />);
  scanRootMock.mockRejectedValue(new Error("refresh failed"));

  await user.click(screen.getByRole("button", { name: "Refresh" }));

  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("refresh failed");
  expect(alert).toBeInTheDocument();
  expect(useWorkspaceStore.getState().error).toBe("refresh failed");
});

test("a later successful refresh clears the workspace error alert", async () => {
  const user = userEvent.setup();
  render(<App />);
  scanRootMock.mockRejectedValueOnce(new Error("refresh failed"));
  await user.click(screen.getByRole("button", { name: "Refresh" }));
  expect(screen.getByRole("alert")).toHaveTextContent("refresh failed");

  scanRootMock.mockResolvedValueOnce(tree);
  await user.click(screen.getByRole("button", { name: "Refresh" }));

  expect(useWorkspaceStore.getState().error).toBeNull();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("the welcome screen offers creating a workspace that lands in the main UI", async () => {
  const user = userEvent.setup();
  useWorkspaceStore.setState({ workspace: null, treeByMount: {}, error: null });
  dialogOpenMock.mockResolvedValue("C:\\notes");
  createWorkspaceApiMock.mockResolvedValue({
    schemaVersion: 1,
    id: "ws-new",
    name: "Study",
    mounts: [],
  });
  scanRootMock.mockResolvedValue(tree);

  render(<App />);

  expect(screen.getByRole("region", { name: "New workspace" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("Workspace name"), "Study");
  await user.click(screen.getByRole("button", { name: "Choose folder" }));
  await user.click(screen.getByRole("button", { name: "Create Workspace" }));

  await waitFor(() => expect(useWorkspaceStore.getState().workspace?.name).toBe("Study"));
  expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  expect(screen.getByRole("treeitem", { name: "a.md" })).toBeInTheDocument();
});

test("switching to welcome with a dirty editor shows the guard and Discard proceeds", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);

  await user.click(screen.getByRole("button", { name: "Switch Workspace" }));

  expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
  expect(useWorkspaceStore.getState().workspace).not.toBeNull();

  await user.click(screen.getByRole("button", { name: "Discard and Switch" }));

  await waitFor(() => expect(useWorkspaceStore.getState().workspace).toBeNull());
  expect(screen.getByText(/No workspace selected/)).toBeInTheDocument();
});

test("Cancel keeps the current workspace when switching would lose a dirty draft", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);

  await user.click(screen.getByRole("button", { name: "Switch Workspace" }));
  await user.click(screen.getByRole("button", { name: "Cancel" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(useWorkspaceStore.getState().workspace).not.toBeNull();
  expect(useEditorStore.getState().draft).toBe("# A edited\n");
  expect(useEditorStore.getState().dirty).toBe(true);
});

test("Save and Switch saves the draft before leaving the workspace", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);
  saveMarkdownDocumentMock.mockResolvedValue({ modifiedAtMs: 1_700_000_000_500, size: 11 });

  await user.click(screen.getByRole("button", { name: "Switch Workspace" }));
  await user.click(screen.getByRole("button", { name: "Save and Switch" }));

  await waitFor(() => expect(useWorkspaceStore.getState().workspace).toBeNull());
  expect(saveMarkdownDocumentMock).toHaveBeenCalledWith(
    expect.objectContaining({ path: A_PATH, content: "# A edited\n" }),
  );
});

test("switching to welcome without unsaved changes goes straight there", async () => {
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("button", { name: "Switch Workspace" }));

  await waitFor(() => expect(useWorkspaceStore.getState().workspace).toBeNull());
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("removing a mount that hosts the open dirty document shows the guard", async () => {
  const user = userEvent.setup();
  render(<App />);
  await openDirtyA(user);

  await user.click(screen.getByRole("button", { name: "Mounts" }));
  await user.click(screen.getByRole("button", { name: "Remove C:\\notes" }));

  expect(screen.getByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
  expect(useWorkspaceStore.getState().workspace?.mounts).toHaveLength(1);

  await user.click(screen.getByRole("button", { name: "Discard and Remove Mount" }));

  await waitFor(() => expect(useWorkspaceStore.getState().workspace?.mounts).toHaveLength(0));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("removing a mount that hosts the open clean document proceeds without a dialog", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("treeitem", { name: "a.md" }));
  await waitFor(() => expect(useEditorStore.getState().document?.path).toBe(A_PATH));

  await user.click(screen.getByRole("button", { name: "Mounts" }));
  await user.click(screen.getByRole("button", { name: "Remove C:\\notes" }));

  await waitFor(() => expect(useWorkspaceStore.getState().workspace?.mounts).toHaveLength(0));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("removing a mount that does not host the open dirty document proceeds without a dialog", async () => {
  const user = userEvent.setup();
  useWorkspaceStore.setState({
    workspace: {
      schemaVersion: 1,
      id: "ws-1",
      name: "Personal",
      mounts: [
        { path: "C:\\notes", permission: "read-write" },
        { path: "D:\\wiki", permission: "read-write" },
      ],
    },
    treeByMount: {
      "C:\\notes": tree,
      "D:\\wiki": [{ name: "b.md", path: "D:\\wiki\\b.md", kind: "markdown" }],
    },
    error: null,
  });
  render(<App />);
  await openDirtyA(user);

  await user.click(screen.getByRole("button", { name: "Mounts" }));
  await user.click(screen.getByRole("button", { name: "Remove D:\\wiki" }));

  await waitFor(() =>
    expect(useWorkspaceStore.getState().workspace?.mounts.map((m) => m.path)).not.toContain(
      "D:\\wiki",
    ),
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(useEditorStore.getState().dirty).toBe(true);
});

