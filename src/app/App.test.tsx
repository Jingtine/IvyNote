import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, expect, test, vi } from "vitest";

import { App } from "./App";
import { readMarkdownFile } from "../features/files/fileApi";
import { useEditorStore } from "../features/editor/editorStore";
import { useWorkspaceStore } from "../features/workspace/workspaceStore";

vi.mock("../features/files/fileApi", () => ({
  readMarkdownFile: vi.fn(),
}));

const readMarkdownFileMock = vi.mocked(readMarkdownFile);

beforeEach(() => {
  readMarkdownFileMock.mockReset();
  useEditorStore.setState({
    document: null,
    draft: "",
    dirty: false,
    loading: false,
    saving: false,
    conflict: false,
    error: null,
  });
  useWorkspaceStore.setState({ rootPath: null, tree: [], error: null });
});

test("renders the Local Knowledge IDE shell", () => {
  render(<App />);
  expect(screen.getByRole("application", { name: "Local Knowledge IDE" })).toBeInTheDocument();
  expect(screen.getByText("Open a local folder to begin")).toBeInTheDocument();
});

test("renders the load error when the first document load fails without an open document", async () => {
  useWorkspaceStore.setState({ rootPath: "C:\\notes" });
  readMarkdownFileMock.mockRejectedValueOnce(new Error("read failed"));
  render(<App />);

  await act(async () => {
    await useEditorStore.getState().loadDocument("C:\\notes\\missing.md");
  });

  expect(screen.getByText("No document open. Select a Markdown file.")).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("read failed");
});
