import { invoke } from "@tauri-apps/api/core";
import type { FileTreeNode } from "../files/fileTypes";
import type { WorkspaceConfig } from "./workspaceConfig";

export async function scanRoot(root: string): Promise<FileTreeNode[]> {
  return invoke<FileTreeNode[]>("scan_root", { root });
}

export async function createWorkspace(name: string): Promise<WorkspaceConfig> {
  return invoke<WorkspaceConfig>("create_workspace", { name });
}

export async function listWorkspaces(): Promise<WorkspaceConfig[]> {
  return invoke<WorkspaceConfig[]>("list_workspaces");
}

export async function openWorkspace(id: string): Promise<WorkspaceConfig> {
  return invoke<WorkspaceConfig>("open_workspace", { id });
}
