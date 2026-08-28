import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";

import type { FileTreeNode } from "../files/fileTypes";
import type { WorkspaceConfig } from "./workspaceConfig";
import {
  createWorkspace,
  listRecentWorkspaces,
  listWorkspaces,
  openWorkspace,
  scanRoot,
  stopWatching,
  watchWorkspace,
} from "./workspaceApi";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
});

test("scanRoot invokes scan_root with the root argument shape", async () => {
  const tree: FileTreeNode[] = [
    {
      name: "Notes",
      path: "C:\\notes",
      kind: "directory",
      children: [{ name: "hello.md", path: "C:\\notes\\hello.md", kind: "markdown" }],
    },
  ];
  invokeMock.mockResolvedValue(tree);

  const result = await scanRoot("C:\\notes", ["node_modules", "dist"]);

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("scan_root", {
    root: "C:\\notes",
    exclusions: ["node_modules", "dist"],
  });
  expect(result).toEqual(tree);
});

test("scanRoot omits exclusions when not provided", async () => {
  invokeMock.mockResolvedValue([]);

  await scanRoot("C:\\notes");

  expect(invokeMock).toHaveBeenCalledWith("scan_root", {
    root: "C:\\notes",
    exclusions: undefined,
  });
});

test("scanRoot propagates invoke errors", async () => {
  invokeMock.mockRejectedValue(new Error("boom"));

  await expect(scanRoot("C:\\missing")).rejects.toThrow("boom");
  expect(invokeMock).toHaveBeenCalledWith("scan_root", {
    root: "C:\\missing",
    exclusions: undefined,
  });
});

test("createWorkspace invokes create_workspace with the name argument shape", async () => {
  const config: WorkspaceConfig = {
    schemaVersion: 1,
    id: "ws-1",
    name: "Personal",
    mounts: [],
    exclusions: [".git"],
  };
  invokeMock.mockResolvedValue(config);

  const result = await createWorkspace("Personal");

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("create_workspace", { name: "Personal" });
  expect(result).toEqual(config);
});

test("listWorkspaces invokes list_workspaces with no arguments", async () => {
  invokeMock.mockResolvedValue([]);

  const result = await listWorkspaces();

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("list_workspaces");
  expect(result).toEqual([]);
});

test("listRecentWorkspaces invokes list_recent_workspaces and returns recent ids", async () => {
  invokeMock.mockResolvedValue(["ws-2", "ws-1"]);

  const result = await listRecentWorkspaces();

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("list_recent_workspaces");
  expect(result).toEqual(["ws-2", "ws-1"]);
});

test("openWorkspace invokes open_workspace with the id argument shape", async () => {
  const config: WorkspaceConfig = {
    schemaVersion: 1,
    id: "ws-1",
    name: "Personal",
    mounts: [],
  };
  invokeMock.mockResolvedValue(config);

  const result = await openWorkspace("ws-1");

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("open_workspace", { id: "ws-1" });
  expect(result).toEqual(config);
});

test("watchWorkspace invokes watch_workspace with the workspace id argument shape", async () => {
  invokeMock.mockResolvedValue(undefined);

  await watchWorkspace("ws-1");

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("watch_workspace", { workspaceId: "ws-1" });
});

test("stopWatching invokes stop_watching_cmd with no arguments", async () => {
  invokeMock.mockResolvedValue(undefined);

  await stopWatching();

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("stop_watching_cmd");
});

test("watchWorkspace propagates invoke errors", async () => {
  invokeMock.mockRejectedValue(new Error("boom"));

  await expect(watchWorkspace("ws-1")).rejects.toThrow("boom");
  expect(invokeMock).toHaveBeenCalledWith("watch_workspace", { workspaceId: "ws-1" });
});

test("stopWatching propagates invoke errors", async () => {
  invokeMock.mockRejectedValue(new Error("boom"));

  await expect(stopWatching()).rejects.toThrow("boom");
  expect(invokeMock).toHaveBeenCalledWith("stop_watching_cmd");
});

test("createWorkspace propagates invoke errors", async () => {
  invokeMock.mockRejectedValue(new Error("boom"));

  await expect(createWorkspace("Nope")).rejects.toThrow("boom");
  expect(invokeMock).toHaveBeenCalledWith("create_workspace", { name: "Nope" });
});

test("openWorkspace propagates invoke errors", async () => {
  invokeMock.mockRejectedValue(new Error("boom"));

  await expect(openWorkspace("missing")).rejects.toThrow("boom");
  expect(invokeMock).toHaveBeenCalledWith("open_workspace", { id: "missing" });
});
