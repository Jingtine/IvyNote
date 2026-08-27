import { create } from "zustand";

import type { FileTreeNode } from "../files/fileTypes";
import type { MountConfig, MountPermission, WorkspaceConfig } from "./workspaceConfig";
import { DEFAULT_EXCLUSIONS } from "./workspaceConfig";
import {
  createWorkspace as createWorkspaceApi,
  openWorkspace as openWorkspaceApi,
  scanRoot,
} from "./workspaceApi";

interface WorkspaceState {
  workspace: WorkspaceConfig | null;
  treeByMount: Record<string, FileTreeNode[]>;
  error: string | null;
  createWorkspace: (name: string, initialMountPath: string) => Promise<void>;
  openWorkspace: (id: string) => Promise<void>;
  switchToWelcome: () => void;
  addMount: (path: string, permission: MountPermission) => Promise<void>;
  removeMount: (path: string) => Promise<void>;
  setMountPermission: (path: string, permission: MountPermission) => Promise<void>;
  refreshTree: () => Promise<void>;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function effectiveExclusions(workspace: WorkspaceConfig, mount: MountConfig): string[] {
  return mount.exclusions ?? workspace.exclusions ?? [...DEFAULT_EXCLUSIONS];
}

function readableMounts(mounts: MountConfig[]): MountConfig[] {
  return mounts.filter((mount) => mount.permission === "read-write" || mount.permission === "read-only");
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: null,
  treeByMount: {},
  error: null,
  createWorkspace: async (name, initialMountPath) => {
    const previous = get().workspace;
    try {
      const created = await createWorkspaceApi(name);
      const initialMount: MountConfig = { path: initialMountPath, permission: "read-write" };
      const tree = await scanRoot(initialMountPath, effectiveExclusions(created, initialMount));
      set({
        workspace: { ...created, mounts: [initialMount] },
        treeByMount: { [initialMountPath]: tree },
        error: null,
      });
    } catch (err) {
      set({ workspace: previous, error: toErrorMessage(err) });
    }
  },
  openWorkspace: async (id) => {
    const previousWorkspace = get().workspace;
    const previousTrees = get().treeByMount;
    try {
      const config = await openWorkspaceApi(id);
      const trees: Record<string, FileTreeNode[]> = {};
      for (const mount of readableMounts(config.mounts)) {
        trees[mount.path] = await scanRoot(mount.path, effectiveExclusions(config, mount));
      }
      set({ workspace: config, treeByMount: trees, error: null });
    } catch (err) {
      set({ workspace: previousWorkspace, treeByMount: previousTrees, error: toErrorMessage(err) });
    }
  },
  switchToWelcome: () => {
    set({ workspace: null, treeByMount: {}, error: null });
  },
  addMount: async (path, permission) => {
    const workspace = get().workspace;
    if (workspace === null) return;
    const mount: MountConfig = { path, permission };
    try {
      const tree = await scanRoot(path, effectiveExclusions(workspace, mount));
      set({
        workspace: { ...workspace, mounts: [...workspace.mounts, mount] },
        treeByMount: { ...get().treeByMount, [path]: tree },
        error: null,
      });
    } catch (err) {
      set({ error: toErrorMessage(err) });
    }
  },
  removeMount: async (path) => {
    const workspace = get().workspace;
    if (workspace === null) return;
    const treeByMount = { ...get().treeByMount };
    delete treeByMount[path];
    set({
      workspace: { ...workspace, mounts: workspace.mounts.filter((mount) => mount.path !== path) },
      treeByMount,
    });
  },
  setMountPermission: async (path, permission) => {
    const workspace = get().workspace;
    if (workspace === null) return;
    set({
      workspace: {
        ...workspace,
        mounts: workspace.mounts.map((mount) =>
          mount.path === path ? { ...mount, permission } : mount,
        ),
      },
    });
  },
  refreshTree: async () => {
    const { workspace } = get();
    if (workspace === null) return;
    try {
      const next: Record<string, FileTreeNode[]> = {};
      for (const mount of readableMounts(workspace.mounts)) {
        next[mount.path] = await scanRoot(mount.path, effectiveExclusions(workspace, mount));
      }
      set({ treeByMount: next, error: null });
    } catch (err) {
      set({ error: toErrorMessage(err) });
    }
  },
}));
