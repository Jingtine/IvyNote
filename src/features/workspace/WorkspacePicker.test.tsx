import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { WorkspacePicker } from "./WorkspacePicker";

const mockState = {
  rootPath: null as string | null,
  openRoot: vi.fn(),
};

vi.mock("./workspaceStore", () => ({
  useWorkspaceStore: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}));

test("Open Folder button calls openRoot", async () => {
  const user = userEvent.setup();
  render(<WorkspacePicker />);

  await user.click(screen.getByRole("button", { name: "Open Folder" }));

  expect(mockState.openRoot).toHaveBeenCalledTimes(1);
});

test("shows the selected root path when one is set", () => {
  mockState.rootPath = "C:\\notes";
  render(<WorkspacePicker />);

  expect(screen.getByText("C:\\notes")).toBeInTheDocument();
  mockState.rootPath = null;
});
