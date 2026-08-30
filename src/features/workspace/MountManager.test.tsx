import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";

import type { MountConfig, WorkspaceConfig } from "./workspaceConfig";
import { MountManager } from "./MountManager";
import {
  addMount,
  scanRoot,
  setMountPermission,
  stopWatching,
  updateMountExclusions,
  updateWorkspaceExclusions,
  watchWorkspace,
} from "./workspaceApi";
import { useWorkspaceStore } from "./workspaceStore";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("./workspaceApi", () => ({
  addMount: vi.fn(),
  createWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  listRecentWorkspaces: vi.fn(),
  removeMount: vi.fn(),
  scanRoot: vi.fn(),
  setMountPermission: vi.fn(),
  stopWatching: vi.fn(),
  updateMountExclusions: vi.fn(),
  updateWorkspaceExclusions: vi.fn(),
  watchWorkspace: vi.fn(),
}));

const addMountApiMock = vi.mocked(addMount);
const openMock = vi.mocked(open);
const scanRootMock = vi.mocked(scanRoot);
const setMountPermissionApiMock = vi.mocked(setMountPermission);
const stopWatchingMock = vi.mocked(stopWatching);
const updateMountExclusionsApiMock = vi.mocked(updateMountExclusions);
const updateWorkspaceExclusionsApiMock = vi.mocked(updateWorkspaceExclusions);
const watchWorkspaceMock = vi.mocked(watchWorkspace);

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

function currentConfig(): WorkspaceConfig {
  const workspace = useWorkspaceStore.getState().workspace;
  if (workspace === null) {
    throw new Error("no workspace in store");
  }
  return workspace;
}

beforeEach(() => {
  addMountApiMock.mockReset();
  addMountApiMock.mockImplementation(async (_id: string, path: string, permission: MountConfig["permission"]) => {
    const current = currentConfig();
    return { ...current, mounts: [...current.mounts, { path, permission }] };
  });
  openMock.mockReset();
  scanRootMock.mockReset();
  setMountPermissionApiMock.mockReset();
  setMountPermissionApiMock.mockImplementation(
    async (_id: string, path: string, permission: MountConfig["permission"]) => {
      const current = currentConfig();
      return {
        ...current,
        mounts: current.mounts.map((mount) =>
          mount.path === path ? { ...mount, permission } : mount,
        ),
      };
    },
  );
  stopWatchingMock.mockReset();
  stopWatchingMock.mockResolvedValue(undefined);
  updateMountExclusionsApiMock.mockReset();
  updateWorkspaceExclusionsApiMock.mockReset();
  watchWorkspaceMock.mockReset();
  watchWorkspaceMock.mockResolvedValue(1);
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

test("workspace default exclusions input shows the built-in defaults when none are set", () => {
  render(<MountManager onRemoveMount={() => {}} />);

  expect(
    screen.getByRole("textbox", { name: "Workspace default exclusions" }),
  ).toHaveValue(".git, node_modules, dist, build, target, .venv, venv, .cache, coverage");
});

test("mounts without an override show the resolved default exclusions", () => {
  render(<MountManager onRemoveMount={() => {}} />);

  expect(
    screen.getAllByText(
      "Effective: .git, node_modules, dist, build, target, .venv, venv, .cache, coverage",
    ),
  ).toHaveLength(2);
});

test("mounts with an override show the override as the effective exclusions", () => {
  useWorkspaceStore.setState({
    workspace: makeWorkspace({
      mounts: [
        { path: "C:\\notes", permission: "read-write", exclusions: ["tmp", "build"] },
        { path: "D:\\archive", permission: "excluded" },
      ],
    }),
    treeByMount: {},
    error: null,
  });

  render(<MountManager onRemoveMount={() => {}} />);

  expect(screen.getByText("Effective: tmp, build")).toBeInTheDocument();
});

test("saving mount exclusions calls the store action with the parsed list", async () => {
  const user = userEvent.setup();
  updateMountExclusionsApiMock.mockResolvedValue(makeWorkspace());
  render(<MountManager onRemoveMount={() => {}} />);

  const input = screen.getByRole("textbox", { name: "Exclusions for C:\\notes" });
  await user.clear(input);
  await user.type(input, "tmp, build, node_modules");
  await user.click(screen.getByRole("button", { name: "Save exclusions for C:\\notes" }));

  await waitFor(() =>
    expect(updateMountExclusionsApiMock).toHaveBeenCalledWith("ws-1", "C:\\notes", [
      "tmp",
      "build",
      "node_modules",
    ]),
  );
});

test("clearing a mount override saves an empty list and shows the inherited default as effective", async () => {
  const user = userEvent.setup();
  useWorkspaceStore.setState({
    workspace: makeWorkspace({
      mounts: [
        { path: "C:\\notes", permission: "read-write", exclusions: ["tmp"] },
        { path: "D:\\archive", permission: "excluded" },
      ],
    }),
    treeByMount: {},
    error: null,
  });
  updateMountExclusionsApiMock.mockResolvedValue(
    makeWorkspace({
      mounts: [
        { path: "C:\\notes", permission: "read-write" },
        { path: "D:\\archive", permission: "excluded" },
      ],
    }),
  );
  render(<MountManager onRemoveMount={() => {}} />);

  const input = screen.getByRole("textbox", { name: "Exclusions for C:\\notes" });
  expect(input).toHaveValue("tmp");
  expect(screen.getByText("Effective: tmp")).toBeInTheDocument();

  await user.clear(input);
  await user.click(screen.getByRole("button", { name: "Save exclusions for C:\\notes" }));

  await waitFor(() =>
    expect(updateMountExclusionsApiMock).toHaveBeenCalledWith("ws-1", "C:\\notes", []),
  );
  expect(
    screen.getAllByText(
      "Effective: .git, node_modules, dist, build, target, .venv, venv, .cache, coverage",
    ),
  ).toHaveLength(2);
});

test("saving workspace default exclusions calls the store action", async () => {
  const user = userEvent.setup();
  updateWorkspaceExclusionsApiMock.mockResolvedValue(makeWorkspace());
  render(<MountManager onRemoveMount={() => {}} />);

  const input = screen.getByRole("textbox", { name: "Workspace default exclusions" });
  await user.clear(input);
  await user.type(input, ".cache, coverage");
  await user.click(screen.getByRole("button", { name: "Save default exclusions" }));

  await waitFor(() =>
    expect(updateWorkspaceExclusionsApiMock).toHaveBeenCalledWith("ws-1", [".cache", "coverage"]),
  );
});
