import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { beforeEach, expect, test, vi } from "vitest";

import type { TextDocumentSnapshot } from "../files/fileTypes";
import { EditorToolbar } from "./EditorToolbar";

const mockState = {
  document: null as TextDocumentSnapshot | null,
  dirty: false,
  saving: false,
  conflict: false,
  fileMissing: false,
  save: vi.fn(),
  loadDocument: vi.fn(),
  dismissConflict: vi.fn(),
};

vi.mock("./editorStore", () => ({
  useEditorStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

function makeSnapshot(overrides: Partial<TextDocumentSnapshot> = {}): TextDocumentSnapshot {
  return {
    path: "C:\\notes\\hello.md",
    content: "# Hello\n",
    modifiedAtMs: 1_700_000_000_000,
    size: 9,
    newline: "lf",
    hasUtf8Bom: false,
    ...overrides,
  };
}

beforeEach(() => {
  mockState.document = makeSnapshot();
  mockState.dirty = false;
  mockState.saving = false;
  mockState.conflict = false;
  mockState.fileMissing = false;
  mockState.save.mockReset();
  mockState.loadDocument.mockReset();
  mockState.dismissConflict.mockReset();
});

test("renders nothing without an open document", () => {
  mockState.document = null;
  const { container } = render(<EditorToolbar />);
  expect(container).toBeEmptyDOMElement();
});

test("Save button is disabled when the document is not dirty", () => {
  render(<EditorToolbar />);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("Save button is enabled and calls save when dirty", async () => {
  mockState.dirty = true;
  const user = userEvent.setup();
  render(<EditorToolbar />);

  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(mockState.save).toHaveBeenCalledTimes(1);
});

test("Save button is disabled while a save is in flight", () => {
  mockState.dirty = true;
  mockState.saving = true;
  render(<EditorToolbar />);
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("Ctrl+S triggers save", () => {
  render(<EditorToolbar />);

  fireEvent.keyDown(window, { key: "s", code: "KeyS", ctrlKey: true });

  expect(mockState.save).toHaveBeenCalledTimes(1);
});

test("Cmd+S triggers save", () => {
  render(<EditorToolbar />);

  fireEvent.keyDown(window, { key: "s", code: "KeyS", metaKey: true });

  expect(mockState.save).toHaveBeenCalledTimes(1);
});

test("shows the conflict message with Reload from disk and Keep editing actions", async () => {
  mockState.conflict = true;
  const user = userEvent.setup();
  render(<EditorToolbar />);

  expect(
    screen.getByText("This file changed outside the app. Your draft has not been overwritten."),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Reload from disk" }));
  expect(mockState.dismissConflict).toHaveBeenCalledTimes(1);
  expect(mockState.loadDocument).toHaveBeenCalledWith("C:\\notes\\hello.md");

  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(mockState.dismissConflict).toHaveBeenCalledTimes(2);
});

test("hides the conflict message when there is no conflict", () => {
  render(<EditorToolbar />);
  expect(
    screen.queryByText("This file changed outside the app. Your draft has not been overwritten."),
  ).not.toBeInTheDocument();
});

test("shows the missing-on-disk message while the file is missing", () => {
  mockState.fileMissing = true;
  render(<EditorToolbar />);

  expect(screen.getByRole("status")).toHaveTextContent(
    "This file is missing on disk. Saving is disabled.",
  );
});

test("hides the missing-on-disk message when the file is present", () => {
  render(<EditorToolbar />);

  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("Save button is disabled while the file is missing on disk even when dirty", () => {
  mockState.dirty = true;
  mockState.fileMissing = true;
  render(<EditorToolbar />);

  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});

test("Ctrl+S does not save while the file is missing on disk", () => {
  mockState.dirty = true;
  mockState.fileMissing = true;
  render(<EditorToolbar />);

  fireEvent.keyDown(window, { key: "s", code: "KeyS", ctrlKey: true });

  expect(mockState.save).not.toHaveBeenCalled();
});
