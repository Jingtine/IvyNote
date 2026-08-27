import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, expect, test, vi } from "vitest";

import { App } from "./App";
import { readMarkdownFile, saveMarkdownDocument } from "../features/files/fileApi";
import type {
  FileTreeNode,
  SaveTextDocumentResult,
  TextDocumentSnapshot,
} from "../features/files/fileTypes";
import { useEditorStore } from "../features/editor/editorStore";
import { scanRoot } from "../features/workspace/workspaceApi";
import { useWorkspaceStore } from "../features/workspace/workspaceStore";

vi.mock("../features/files/fileApi", () => ({
  readMarkdownFile: vi.fn(),
  saveMarkdownDocument: vi.fn(),
}));

vi.mock("../features/workspace/workspaceApi", () => ({
  scanRoot: vi.fn(),
}));

const readMarkdownFileMock = vi.mocked(readMarkdownFile);
const saveMarkdownDocumentMock = vi.mocked(saveMarkdownDocument);
const scanRootMock = vi.mocked(scanRoot);

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
  readMarkdownFileMock.mockImplementation(async (path: string) => snapshot(path, `# ${path}\n`));
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
  useWorkspaceStore.setState({ rootPath: "C:\\notes", tree, error: null });
});

test("renders the Local Knowledge IDE shell", () => {
  useWorkspaceStore.setState({ rootPath: null, tree: [] });
  render(<App />);
  expect(screen.getByRole("application", { name: "Local Knowledge IDE" })).toBeInTheDocument();
  expect(screen.getByText("Open a local folder to begin")).toBeInTheDocument();
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
  expect(useWorkspaceStore.getState().rootPath).toBe("C:\\notes");
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
