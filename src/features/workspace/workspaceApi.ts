import { invoke } from "@tauri-apps/api/core";
import type { FileTreeNode } from "../files/fileTypes";

export async function scanRoot(root: string): Promise<FileTreeNode[]> {
  return invoke<FileTreeNode[]>("scan_root", { root });
}
