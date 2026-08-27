import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";

import type { WorkspaceConfig } from "./workspaceConfig";
import { MountManager } from "./MountManager";
import { scanRoot } from "./workspaceApi";
import { useWorkspaceStore } from "./workspaceStore";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("./workspaceApi", () => ({
  createWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  listRecentWorkspaces: vi.fn(),
  scanRoot: vi.fn(),
}));

const openMock = vi.mocked(open);
const scanRootMock = vi.mocked(scanRoot);

function makeWorkspace(overrides: Partial<WorkspaceConfig> = {}): WorkspaceConfig {
  return {
    schemaVersion: 1,
    id: "ws-1",
    name: "Personal",
    mounts: [
      { path: "C:\\notes", permission: "read-write" },
      { path: "D:\\archive", permission: "excluded" },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  openMock.mockReset();
  scanRootMock.mockReset();
  useWorkspaceStore.setState({
    workspace: makeWorkspace(),
    treeByMount: {},
    error: null,
  });
});

test("lists mounts with their permission in the dropdown", () => {
  render(<MountManager onRemoveMount={() => {}} />);

  expect(screen.getByText("C:\\notes")).toBeInTheDocument();
  expect(screen.getByText("D:\\archive")).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Permission for C:\\notes" })).toHaveValue(
    "read-write",
  );
  expect(screen.getByRole("combobox", { name: "Permission for D:\\archive" })).toHaveValue(
    "excluded",
  );
});

test("changing the permission dropdown updates the mount in the store", async () => {
  const user = userEvent.setup();
  render(<MountManager onRemoveMount={() => {}} />);

  await user.selectOptions(
    screen.getByRole("combobox", { name: "Permission for C:\\notes" }),
    "read-only",
  );

  const mount = useWorkspaceStore
    .getState()
    .workspace?.mounts.find((m) => m.path === "C:\\notes");
  expect(mount?.permission).toBe("read-only");
});

test("add mount picks a folder via the dialog and adds it as a read-write mount", async () => {
  const user = userEvent.setup();
  openMock.mockResolvedValue("D:\\vault");
  scanRootMock.mockResolvedValue([]);
  render(<MountManager onRemoveMount={() => {}} />);

  await user.click(screen.getByRole("button", { name: "Add mount" }));

  await waitFor(() =>
    expect(useWorkspaceStore.getState().workspace?.mounts.map((m) => m.path)).toContain(
      "D:\\vault",
    ),
  );
  expect(openMock).toHaveBeenCalledWith({ directory: true });
  const added = useWorkspaceStore
    .getState()
    .workspace?.mounts.find((m) => m.path === "D:\\vault");
  expect(added?.permission).toBe("read-write");
});

test("cancelling the folder dialog does not add a mount", async () => {
  const user = userEvent.setup();
  openMock.mockResolvedValue(null);
  render(<MountManager onRemoveMount={() => {}} />);

  await user.click(screen.getByRole("button", { name: "Add mount" }));

  expect(useWorkspaceStore.getState().workspace?.mounts).toHaveLength(2);
  expect(scanRootMock).not.toHaveBeenCalled();
});

test("remove button calls the onRemoveMount callback with the mount path", async () => {
  const user = userEvent.setup();
  const onRemoveMount = vi.fn();
  render(<MountManager onRemoveMount={onRemoveMount} />);

  await user.click(screen.getByRole("button", { name: "Remove C:\\notes" }));

  expect(onRemoveMount).toHaveBeenCalledTimes(1);
  expect(onRemoveMount).toHaveBeenCalledWith("C:\\notes");
});
