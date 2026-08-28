import { beforeEach, expect, test, vi } from "vitest";

import type { FileTreeNode } from "../files/fileTypes";
import type { WorkspaceConfig } from "./workspaceConfig";
import {
  addMount as addMountApi,
  createWorkspace as createWorkspaceApi,
  listWorkspaces,
  openWorkspace as openWorkspaceApi,
  removeMount as removeMountApi,
  scanRoot,
  setMountPermission as setMountPermissionApi,
  stopWatching,
  updateMountExclusions as updateMountExclusionsApi,
  updateWorkspaceExclusions as updateWorkspaceExclusionsApi,
  watchWorkspace,
} from "./workspaceApi";
import { useWorkspaceStore } from "./workspaceStore";

vi.mock("./workspaceApi", () => ({
  addMount: vi.fn(),
  createWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  openWorkspace: vi.fn(),
  removeMount: vi.fn(),
  scanRoot: vi.fn(),
  setMountPermission: vi.fn(),
  stopWatching: vi.fn(),
  updateMountExclusions: vi.fn(),
  updateWorkspaceExclusions: vi.fn(),
  watchWorkspace: vi.fn(),
}));

const addMountApiMock = vi.mocked(addMountApi);
const createWorkspaceApiMock = vi.mocked(createWorkspaceApi);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const openWorkspaceApiMock = vi.mocked(openWorkspaceApi);
const removeMountApiMock = vi.mocked(removeMountApi);
const scanRootMock = vi.mocked(scanRoot);
const setMountPermissionApiMock = vi.mocked(setMountPermissionApi);
const stopWatchingMock = vi.mocked(stopWatching);
const updateMountExclusionsApiMock = vi.mocked(updateMountExclusionsApi);
const updateWorkspaceExclusionsApiMock = vi.mocked(updateWorkspaceExclusionsApi);
const watchWorkspaceMock = vi.mocked(watchWorkspace);

function makeWorkspace(overrides: Partial<WorkspaceConfig> = {}): WorkspaceConfig {
  return {
    schemaVersion: 1,
    id: "ws-1",
    name: "Personal",
    mounts: [
      { path: "C:\\notes", permission: "read-write" },
      { path: "D:\\wiki", permission: "read-only" },
      { path: "D:\\archive", permission: "excluded" },
    ],
    exclusions: [".git", "node_modules"],
    ...overrides,
  };
}

const notesTree: FileTreeNode[] = [{ name: "a.md", path: "C:\\notes\\a.md", kind: "markdown" }];
const wikiTree: FileTreeNode[] = [{ name: "b.md", path: "D:\\wiki\\b.md", kind: "markdown" }];
const archiveTree: FileTreeNode[] = [
  { name: "old.md", path: "D:\\archive\\old.md", kind: "markdown" },
];

beforeEach(() => {
  addMountApiMock.mockReset();
  createWorkspaceApiMock.mockReset();
  listWorkspacesMock.mockReset();
  openWorkspaceApiMock.mockReset();
  removeMountApiMock.mockReset();
  scanRootMock.mockReset();
  setMountPermissionApiMock.mockReset();
  stopWatchingMock.mockReset();
  stopWatchingMock.mockResolvedValue(undefined);
  updateMountExclusionsApiMock.mockReset();
  updateWorkspaceExclusionsApiMock.mockReset();
  watchWorkspaceMock.mockReset();
  watchWorkspaceMock.mockResolvedValue(undefined);
  useWorkspaceStore.setState({ workspace: null, treeByMount: {}, error: null });
});

test("initial state has no workspace", () => {
  expect(useWorkspaceStore.getInitialState().workspace).toBeNull();
  expect(useWorkspaceStore.getInitialState().treeByMount).toEqual({});
  expect(useWorkspaceStore.getInitialState().error).toBeNull();
});

test("createWorkspace sets the workspace name and populates the initial mount tree", async () => {
  const created: WorkspaceConfig = { schemaVersion: 1, id: "ws-new", name: "Study", mounts: [] };
  createWorkspaceApiMock.mockResolvedValue(created);
  scanRootMock.mockResolvedValue(notesTree);

  await useWorkspaceStore.getState().createWorkspace("Study", "C:\\notes");

  expect(createWorkspaceApiMock).toHaveBeenCalledTimes(1);
  expect(createWorkspaceApiMock).toHaveBeenCalledWith("Study");
  expect(scanRootMock).toHaveBeenCalledWith(
    "C:\\notes",
    [".git", "node_modules", "dist", "build", "target", ".venv", "venv", ".cache", "coverage"],
  );
  const state = useWorkspaceStore.getState();
  expect(state.workspace?.id).toBe("ws-new");
  expect(state.workspace?.name).toBe("Study");
  expect(state.workspace?.mounts).toEqual([
    { path: "C:\\notes", permission: "read-write" },
  ]);
  expect(state.treeByMount["C:\\notes"]).toEqual(notesTree);
  expect(state.error).toBeNull();
});

test("createWorkspace starts watching the new workspace", async () => {
  const created: WorkspaceConfig = { schemaVersion: 1, id: "ws-new", name: "Study", mounts: [] };
  createWorkspaceApiMock.mockResolvedValue(created);
  scanRootMock.mockResolvedValue(notesTree);

  await useWorkspaceStore.getState().createWorkspace("Study", "C:\\notes");

  expect(watchWorkspaceMock).toHaveBeenCalledTimes(1);
  expect(watchWorkspaceMock).toHaveBeenCalledWith("ws-new");
});

test("createWorkspace with a failing scan keeps the prior workspace and records the error", async () => {
  const existing = makeWorkspace();
  useWorkspaceStore.setState({ workspace: existing, treeByMount: { "C:\\notes": notesTree } });
  createWorkspaceApiMock.mockResolvedValue({
    schemaVersion: 1,
    id: "ws-new",
    name: "Study",
    mounts: [],
  });
  scanRootMock.mockRejectedValue(new Error("scan failed"));

  await useWorkspaceStore.getState().createWorkspace("Study", "C:\\notes");

  const state = useWorkspaceStore.getState();
  expect(state.workspace).toEqual(existing);
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree });
  expect(state.error).toBe("scan failed");
});

test("openWorkspace scans read-write and read-only mounts and skips excluded ones", async () => {
  const config = makeWorkspace();
  openWorkspaceApiMock.mockResolvedValue(config);
  scanRootMock.mockResolvedValueOnce(notesTree).mockResolvedValueOnce(wikiTree);

  await useWorkspaceStore.getState().openWorkspace("ws-1");

  expect(openWorkspaceApiMock).toHaveBeenCalledTimes(1);
  expect(openWorkspaceApiMock).toHaveBeenCalledWith("ws-1");
  expect(scanRootMock).toHaveBeenCalledTimes(2);
  expect(scanRootMock).toHaveBeenNthCalledWith(1, "C:\\notes", [".git", "node_modules"]);
  expect(scanRootMock).toHaveBeenNthCalledWith(2, "D:\\wiki", [".git", "node_modules"]);
  const state = useWorkspaceStore.getState();
  expect(state.workspace).toEqual(config);
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree, "D:\\wiki": wikiTree });
  expect(state.treeByMount["D:\\archive"]).toBeUndefined();
});

test("openWorkspace applies the mount's own exclusions when present", async () => {
  const config = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-write", exclusions: ["tmp"] },
      { path: "D:\\wiki", permission: "read-only" },
    ],
  });
  openWorkspaceApiMock.mockResolvedValue(config);
  scanRootMock.mockResolvedValue(notesTree).mockResolvedValue(wikiTree);

  await useWorkspaceStore.getState().openWorkspace("ws-1");

  expect(scanRootMock).toHaveBeenNthCalledWith(1, "C:\\notes", ["tmp"]);
  expect(scanRootMock).toHaveBeenNthCalledWith(2, "D:\\wiki", [".git", "node_modules"]);
});

test("openWorkspace starts watching after mounts are loaded", async () => {
  const config = makeWorkspace();
  openWorkspaceApiMock.mockResolvedValue(config);
  scanRootMock.mockResolvedValueOnce(notesTree).mockResolvedValueOnce(wikiTree);

  await useWorkspaceStore.getState().openWorkspace("ws-1");

  expect(watchWorkspaceMock).toHaveBeenCalledTimes(1);
  expect(watchWorkspaceMock).toHaveBeenCalledWith("ws-1");
});

test("a watcher start failure on open is non-blocking and surfaces the error", async () => {
  const config = makeWorkspace();
  openWorkspaceApiMock.mockResolvedValue(config);
  scanRootMock.mockResolvedValueOnce(notesTree).mockResolvedValueOnce(wikiTree);
  watchWorkspaceMock.mockRejectedValueOnce(new Error("watch failed"));

  await useWorkspaceStore.getState().openWorkspace("ws-1");

  const state = useWorkspaceStore.getState();
  expect(state.workspace).toEqual(config);
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree, "D:\\wiki": wikiTree });
  expect(state.error).toBe("watch failed");
});

test("a scanner error on open leaves the workspace untouched and records the error", async () => {
  const existing = makeWorkspace();
  useWorkspaceStore.setState({ workspace: existing, treeByMount: { "C:\\notes": notesTree } });
  const failing = makeWorkspace({ id: "ws-other", name: "Other" });
  openWorkspaceApiMock.mockResolvedValue(failing);
  scanRootMock.mockRejectedValue(new Error("scan failed"));

  await useWorkspaceStore.getState().openWorkspace("ws-other");

  const state = useWorkspaceStore.getState();
  expect(state.workspace).toEqual(existing);
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree });
  expect(state.error).toBe("scan failed");
});

test("addMount persists via the API, adopts the returned config, scans, and updates treeByMount", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree },
  });
  const updated = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-write" },
      { path: "D:\\wiki", permission: "read-only" },
      { path: "D:\\archive", permission: "excluded" },
      { path: "D:\\vault", permission: "read-write" },
    ],
  });
  addMountApiMock.mockResolvedValue(updated);
  scanRootMock.mockResolvedValue(archiveTree);

  await useWorkspaceStore.getState().addMount("D:\\vault", "read-write");

  expect(addMountApiMock).toHaveBeenCalledTimes(1);
  expect(addMountApiMock).toHaveBeenCalledWith("ws-1", "D:\\vault", "read-write");
  expect(scanRootMock).toHaveBeenCalledWith("D:\\vault", [".git", "node_modules"]);
  const state = useWorkspaceStore.getState();
  expect(state.workspace).toEqual(updated);
  expect(state.treeByMount["D:\\vault"]).toEqual(archiveTree);
  expect(state.treeByMount["C:\\notes"]).toEqual(notesTree);
});

test("addMount with a failing scan keeps the persisted config but records the error", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree },
  });
  const updated = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-write" },
      { path: "D:\\wiki", permission: "read-only" },
      { path: "D:\\archive", permission: "excluded" },
      { path: "D:\\vault", permission: "read-write" },
    ],
  });
  addMountApiMock.mockResolvedValue(updated);
  scanRootMock.mockRejectedValue(new Error("scan failed"));

  await useWorkspaceStore.getState().addMount("D:\\vault", "read-write");

  const state = useWorkspaceStore.getState();
  expect(state.workspace).toEqual(updated);
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree });
  expect(state.error).toBe("scan failed");
});

test("addMount re-syncs the watcher with the workspace id", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree },
  });
  const updated = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-write" },
      { path: "D:\\wiki", permission: "read-only" },
      { path: "D:\\archive", permission: "excluded" },
      { path: "D:\\vault", permission: "read-write" },
    ],
  });
  addMountApiMock.mockResolvedValue(updated);
  scanRootMock.mockResolvedValue(archiveTree);

  await useWorkspaceStore.getState().addMount("D:\\vault", "read-write");

  expect(watchWorkspaceMock).toHaveBeenCalledTimes(1);
  expect(watchWorkspaceMock).toHaveBeenCalledWith("ws-1");
});

test("addMount watches only after the persisted config with the new mount is in place", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree },
  });
  const updated = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-write" },
      { path: "D:\\wiki", permission: "read-only" },
      { path: "D:\\archive", permission: "excluded" },
      { path: "D:\\vault", permission: "read-write" },
    ],
  });
  addMountApiMock.mockResolvedValue(updated);
  scanRootMock.mockResolvedValue(archiveTree);
  let mountsAtWatchTime: string[] = [];
  watchWorkspaceMock.mockImplementation(() => {
    mountsAtWatchTime = useWorkspaceStore.getState().workspace?.mounts.map((mount) => mount.path) ?? [];
    return Promise.resolve();
  });

  await useWorkspaceStore.getState().addMount("D:\\vault", "read-write");

  expect(mountsAtWatchTime).toContain("D:\\vault");
  expect(watchWorkspaceMock).toHaveBeenCalledWith("ws-1");
});

test("removeMount persists via the API, adopts the returned config, and removes the tree", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree, "D:\\wiki": wikiTree },
  });
  const updated = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-write" },
      { path: "D:\\archive", permission: "excluded" },
    ],
  });
  removeMountApiMock.mockResolvedValue(updated);

  await useWorkspaceStore.getState().removeMount("D:\\wiki");

  expect(removeMountApiMock).toHaveBeenCalledTimes(1);
  expect(removeMountApiMock).toHaveBeenCalledWith("ws-1", "D:\\wiki");
  const state = useWorkspaceStore.getState();
  expect(state.workspace).toEqual(updated);
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree });
});

test("removeMount re-syncs the watcher after removing the mount", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree, "D:\\wiki": wikiTree },
  });
  const updated = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-write" },
      { path: "D:\\archive", permission: "excluded" },
    ],
  });
  removeMountApiMock.mockResolvedValue(updated);

  await useWorkspaceStore.getState().removeMount("D:\\wiki");

  expect(watchWorkspaceMock).toHaveBeenCalledTimes(1);
  expect(watchWorkspaceMock).toHaveBeenCalledWith("ws-1");
});

test("setMountPermission re-syncs the watcher after the permission change", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree },
  });
  const updated = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "excluded" },
      { path: "D:\\wiki", permission: "read-only" },
      { path: "D:\\archive", permission: "excluded" },
    ],
  });
  setMountPermissionApiMock.mockResolvedValue(updated);

  await useWorkspaceStore.getState().setMountPermission("C:\\notes", "excluded");

  expect(setMountPermissionApiMock).toHaveBeenCalledTimes(1);
  expect(setMountPermissionApiMock).toHaveBeenCalledWith("ws-1", "C:\\notes", "excluded");
  expect(watchWorkspaceMock).toHaveBeenCalledTimes(1);
  expect(watchWorkspaceMock).toHaveBeenCalledWith("ws-1");
});

test("setMountPermission persists via the API and updates the mount without rescansing", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree },
  });
  const updated = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-only" },
      { path: "D:\\wiki", permission: "read-only" },
      { path: "D:\\archive", permission: "excluded" },
    ],
  });
  setMountPermissionApiMock.mockResolvedValue(updated);

  await useWorkspaceStore.getState().setMountPermission("C:\\notes", "read-only");

  expect(setMountPermissionApiMock).toHaveBeenCalledWith("ws-1", "C:\\notes", "read-only");
  expect(scanRootMock).not.toHaveBeenCalled();
  const state = useWorkspaceStore.getState();
  expect(state.workspace).toEqual(updated);
  expect(state.treeByMount["C:\\notes"]).toEqual(notesTree);
});

test("switchToWelcome stops watching before clearing the workspace", () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree },
  });

  useWorkspaceStore.getState().switchToWelcome();

  expect(stopWatchingMock).toHaveBeenCalledTimes(1);
  const state = useWorkspaceStore.getState();
  expect(state.workspace).toBeNull();
  expect(state.treeByMount).toEqual({});
  expect(state.error).toBeNull();
});

test("refreshTree rescans all read-write and read-only mounts", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree, "D:\\wiki": wikiTree },
  });
  const refreshedNotes: FileTreeNode[] = [
    { name: "a.md", path: "C:\\notes\\a.md", kind: "markdown" },
    { name: "c.md", path: "C:\\notes\\c.md", kind: "markdown" },
  ];
  scanRootMock.mockResolvedValueOnce(refreshedNotes).mockResolvedValueOnce(wikiTree);

  await useWorkspaceStore.getState().refreshTree();

  expect(scanRootMock).toHaveBeenCalledTimes(2);
  expect(scanRootMock).toHaveBeenNthCalledWith(1, "C:\\notes", [".git", "node_modules"]);
  expect(scanRootMock).toHaveBeenNthCalledWith(2, "D:\\wiki", [".git", "node_modules"]);
  const state = useWorkspaceStore.getState();
  expect(state.treeByMount["C:\\notes"]).toEqual(refreshedNotes);
  expect(state.treeByMount["D:\\wiki"]).toEqual(wikiTree);
  expect(state.error).toBeNull();
});

test("refreshTree drops trees for mounts excluded after a permission change", async () => {
  const config = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-write" },
      { path: "D:\\wiki", permission: "read-only" },
    ],
  });
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree, "D:\\wiki": wikiTree },
  });
  const excluded = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "excluded" },
      { path: "D:\\wiki", permission: "read-only" },
    ],
  });
  setMountPermissionApiMock.mockResolvedValue(excluded);

  await useWorkspaceStore.getState().setMountPermission("C:\\notes", "excluded");
  const refreshedWiki: FileTreeNode[] = [
    { name: "b.md", path: "D:\\wiki\\b.md", kind: "markdown" },
    { name: "d.md", path: "D:\\wiki\\d.md", kind: "markdown" },
  ];
  scanRootMock.mockResolvedValue(refreshedWiki);

  await useWorkspaceStore.getState().refreshTree();

  expect(scanRootMock).toHaveBeenCalledTimes(1);
  expect(scanRootMock).toHaveBeenCalledWith("D:\\wiki", [".git", "node_modules"]);
  const state = useWorkspaceStore.getState();
  expect(state.treeByMount["C:\\notes"]).toBeUndefined();
  expect(state.treeByMount["D:\\wiki"]).toEqual(refreshedWiki);
  expect(state.error).toBeNull();
});

test("refreshTree error keeps the old trees and records the error", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree, "D:\\wiki": wikiTree },
  });
  scanRootMock.mockRejectedValue(new Error("refresh failed"));

  await useWorkspaceStore.getState().refreshTree();

  const state = useWorkspaceStore.getState();
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree, "D:\\wiki": wikiTree });
  expect(state.workspace).toEqual(config);
  expect(state.error).toBe("refresh failed");
});

test("updateMountExclusions persists via the API and rescans only the mount", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree, "D:\\wiki": wikiTree },
  });
  const updated = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-write", exclusions: ["tmp"] },
      { path: "D:\\wiki", permission: "read-only" },
      { path: "D:\\archive", permission: "excluded" },
    ],
  });
  updateMountExclusionsApiMock.mockResolvedValue(updated);
  const refreshedNotes: FileTreeNode[] = [
    { name: "a.md", path: "C:\\notes\\a.md", kind: "markdown" },
    { name: "new.md", path: "C:\\notes\\new.md", kind: "markdown" },
  ];
  scanRootMock.mockResolvedValueOnce(refreshedNotes);

  await useWorkspaceStore.getState().updateMountExclusions("C:\\notes", ["tmp"]);

  expect(updateMountExclusionsApiMock).toHaveBeenCalledTimes(1);
  expect(updateMountExclusionsApiMock).toHaveBeenCalledWith("ws-1", "C:\\notes", ["tmp"]);
  expect(scanRootMock).toHaveBeenCalledTimes(1);
  expect(scanRootMock).toHaveBeenCalledWith("C:\\notes", ["tmp"]);
  const state = useWorkspaceStore.getState();
  expect(state.workspace).toEqual(updated);
  expect(state.treeByMount["C:\\notes"]).toEqual(refreshedNotes);
  expect(state.treeByMount["D:\\wiki"]).toEqual(wikiTree);
});

test("updateMountExclusions with an empty list clears the override and rescans with inherited defaults", async () => {
  const config = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-write", exclusions: ["tmp"] },
      { path: "D:\\wiki", permission: "read-only" },
      { path: "D:\\archive", permission: "excluded" },
    ],
  });
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree, "D:\\wiki": wikiTree },
  });
  const updated = makeWorkspace({
    mounts: [
      { path: "C:\\notes", permission: "read-write" },
      { path: "D:\\wiki", permission: "read-only" },
      { path: "D:\\archive", permission: "excluded" },
    ],
  });
  updateMountExclusionsApiMock.mockResolvedValue(updated);
  const refreshedNotes: FileTreeNode[] = [
    { name: "a.md", path: "C:\\notes\\a.md", kind: "markdown" },
    { name: "new.md", path: "C:\\notes\\new.md", kind: "markdown" },
  ];
  scanRootMock.mockResolvedValueOnce(refreshedNotes);

  await useWorkspaceStore.getState().updateMountExclusions("C:\\notes", []);

  expect(updateMountExclusionsApiMock).toHaveBeenCalledTimes(1);
  expect(updateMountExclusionsApiMock).toHaveBeenCalledWith("ws-1", "C:\\notes", []);
  expect(scanRootMock).toHaveBeenCalledTimes(1);
  expect(scanRootMock).toHaveBeenCalledWith("C:\\notes", [".git", "node_modules"]);
  const state = useWorkspaceStore.getState();
  expect(state.workspace?.mounts[0].exclusions).toBeUndefined();
  expect(state.treeByMount["C:\\notes"]).toEqual(refreshedNotes);
  expect(state.treeByMount["D:\\wiki"]).toEqual(wikiTree);
});

test("updateWorkspaceExclusions persists and rescans all readable mounts", async () => {
  const config = makeWorkspace();
  useWorkspaceStore.setState({
    workspace: config,
    treeByMount: { "C:\\notes": notesTree, "D:\\wiki": wikiTree },
  });
  const updated = makeWorkspace({ exclusions: ["dist", "coverage"] });
  updateWorkspaceExclusionsApiMock.mockResolvedValue(updated);
  scanRootMock.mockResolvedValueOnce(notesTree).mockResolvedValueOnce(wikiTree);

  await useWorkspaceStore.getState().updateWorkspaceExclusions(["dist", "coverage"]);

  expect(updateWorkspaceExclusionsApiMock).toHaveBeenCalledTimes(1);
  expect(updateWorkspaceExclusionsApiMock).toHaveBeenCalledWith("ws-1", ["dist", "coverage"]);
  expect(scanRootMock).toHaveBeenCalledTimes(2);
  expect(scanRootMock).toHaveBeenNthCalledWith(1, "C:\\notes", ["dist", "coverage"]);
  expect(scanRootMock).toHaveBeenNthCalledWith(2, "D:\\wiki", ["dist", "coverage"]);
  const state = useWorkspaceStore.getState();
  expect(state.workspace?.exclusions).toEqual(["dist", "coverage"]);
  expect(state.treeByMount).toEqual({ "C:\\notes": notesTree, "D:\\wiki": wikiTree });
});
