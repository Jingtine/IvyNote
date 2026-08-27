import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { WorkspacePicker } from "./WorkspacePicker";

const mockState = {
  workspace: null as { name: string } | null,
  switchToWelcome: vi.fn(),
};

vi.mock("./workspaceStore", () => ({
  useWorkspaceStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

test("Switch Workspace button calls switchToWelcome", async () => {
  const user = userEvent.setup();
  render(<WorkspacePicker />);

  await user.click(screen.getByRole("button", { name: "Switch Workspace" }));

  expect(mockState.switchToWelcome).toHaveBeenCalledTimes(1);
});

test("shows the workspace name when one is active", () => {
  mockState.workspace = { name: "Personal" };
  render(<WorkspacePicker />);

  expect(screen.getByText("Personal")).toBeInTheDocument();
  mockState.workspace = null;
});
