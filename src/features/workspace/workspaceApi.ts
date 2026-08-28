import { invoke } from "@tauri-apps/api/core";
import type { FileTreeNode } from "../files/fileTypes";
import type { WorkspaceConfig } from "./workspaceConfig";

export async function scanRoot(
  root: string,
  exclusions?: string[],
): Promise<FileTreeNode[]> {
  return invoke<FileTreeNode[]>("scan_root", { root, exclusions });
}

export async function createWorkspace(name: string): Promise<WorkspaceConfig> {
  return invoke<WorkspaceConfig>("create_workspace", { name });
}

export async function listWorkspaces(): Promise<WorkspaceConfig[]> {
  return invoke<WorkspaceConfig[]>("list_workspaces");
}

export async function listRecentWorkspaces(): Promise<string[]> {
  return invoke<string[]>("list_recent_workspaces");
}

export async function openWorkspace(id: string): Promise<WorkspaceConfig> {
  return invoke<WorkspaceConfig>("open_workspace", { id });
}

export async function watchWorkspace(workspaceId: string): Promise<void> {
  return invoke("watch_workspace", { workspaceId });
}

export async function stopWatching(): Promise<void> {
  return invoke("stop_watching_cmd");
}

export async function updateMountExclusions(
  workspaceId: string,
  path: string,
  exclusions: string[],
): Promise<WorkspaceConfig> {
  return invoke<WorkspaceConfig>("update_mount_exclusions", { workspaceId, path, exclusions });
}

export async function updateWorkspaceExclusions(
  workspaceId: string,
  exclusions: string[],
): Promise<WorkspaceConfig> {
  return invoke<WorkspaceConfig>("update_workspace_exclusions", { workspaceId, exclusions });
}
