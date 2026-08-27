import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

type ActionMock = ReturnType<typeof vi.fn<() => void>>;

interface DialogProps {
  currentFileName: string;
  targetFileName: string;
  onSaveAndOpen: ActionMock;
  onDiscardAndOpen: ActionMock;
  onCancel: ActionMock;
}

function renderDialog(): DialogProps {
  const props: DialogProps = {
    currentFileName: "a.md",
    targetFileName: "b.md",
    onSaveAndOpen: vi.fn(),
    onDiscardAndOpen: vi.fn(),
    onCancel: vi.fn(),
  };
  render(
    <UnsavedChangesDialog
      currentFileName={props.currentFileName}
      targetFileName={props.targetFileName}
      onSaveAndOpen={props.onSaveAndOpen}
      onDiscardAndOpen={props.onDiscardAndOpen}
      onCancel={props.onCancel}
    />,
  );
  return props;
}

test("renders an accessible dialog naming the unsaved file and the target", () => {
  renderDialog();

  const dialog = screen.getByRole("dialog", { name: "Unsaved changes" });

  expect(dialog).toHaveTextContent("a.md");
  expect(dialog).toHaveTextContent("b.md");
});

test("offers exactly Save and Open, Discard and Open, and Cancel", () => {
  renderDialog();

  expect(screen.getByRole("button", { name: "Save and Open" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Discard and Open" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
});

test("Save and Open invokes only the save-and-open handler", async () => {
  const user = userEvent.setup();
  const props = renderDialog();

  await user.click(screen.getByRole("button", { name: "Save and Open" }));

  expect(props.onSaveAndOpen).toHaveBeenCalledTimes(1);
  expect(props.onDiscardAndOpen).not.toHaveBeenCalled();
  expect(props.onCancel).not.toHaveBeenCalled();
});

test("Discard and Open invokes only the discard-and-open handler", async () => {
  const user = userEvent.setup();
  const props = renderDialog();

  await user.click(screen.getByRole("button", { name: "Discard and Open" }));

  expect(props.onDiscardAndOpen).toHaveBeenCalledTimes(1);
  expect(props.onSaveAndOpen).not.toHaveBeenCalled();
  expect(props.onCancel).not.toHaveBeenCalled();
});

test("Cancel invokes only the cancel handler", async () => {
  const user = userEvent.setup();
  const props = renderDialog();

  await user.click(screen.getByRole("button", { name: "Cancel" }));

  expect(props.onCancel).toHaveBeenCalledTimes(1);
  expect(props.onSaveAndOpen).not.toHaveBeenCalled();
  expect(props.onDiscardAndOpen).not.toHaveBeenCalled();
});

test("renders a blocked message inside the dialog when one is provided", () => {
  render(
    <UnsavedChangesDialog
      currentFileName="a.md"
      targetFileName="b.md"
      blockedMessage="This file is missing on disk, so saving is disabled."
      onSaveAndOpen={vi.fn()}
      onDiscardAndOpen={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

  const dialog = screen.getByRole("dialog", { name: "Unsaved changes" });
  expect(screen.getByRole("alert")).toHaveTextContent("missing on disk");
  expect(dialog).toContainElement(screen.getByRole("alert"));
});

test("renders no blocked message when none is provided", () => {
  renderDialog();

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
