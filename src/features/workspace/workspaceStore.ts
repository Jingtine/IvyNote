import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";

import type { FileTreeNode } from "../files/fileTypes";
import { scanRoot } from "./workspaceApi";

interface WorkspaceState {
  rootPath: string | null;
  tree: FileTreeNode[];
  error: string | null;
  openRoot: () => Promise<void>;
  refreshTree: () => Promise<void>;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  rootPath: null,
  tree: [],
  error: null,
  openRoot: async () => {
    const selected = await open({ directory: true });
    if (selected === null) return;
    try {
      const tree = await scanRoot(selected);
      set({ rootPath: selected, tree, error: null });
    } catch (err) {
      set({ error: toErrorMessage(err) });
    }
  },
  refreshTree: async () => {
    const { rootPath } = get();
    if (rootPath === null) return;
    try {
      const tree = await scanRoot(rootPath);
      set({ tree, error: null });
    } catch (err) {
      set({ error: toErrorMessage(err) });
    }
  },
}));
