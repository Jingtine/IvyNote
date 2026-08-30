import { create } from "zustand";

import { useEditorStore } from "../editor/editorStore";
import type { FileTreeNode } from "../files/fileTypes";
import type { MountConfig, MountPermission, WorkspaceConfig } from "./workspaceConfig";
import { DEFAULT_EXCLUSIONS } from "./workspaceConfig";
import {
  addMount as addMountApi,
  createWorkspace as createWorkspaceApi,
  openWorkspace as openWorkspaceApi,
  removeMount as removeMountApi,
  scanRoot,
  setMountPermission as setMountPermissionApi,
  stopWatching,
  updateMountExclusions as updateMountExclusionsApi,
  updateWorkspaceExclusions as updateWorkspaceExclusionsApi,
  watchWorkspace,
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
  updateMountExclusions: (path: string, exclusions: string[]) => Promise<void>;
  updateWorkspaceExclusions: (exclusions: string[]) => Promise<void>;
  refreshTree: () => Promise<void>;
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Fire-and-forget watcher lifecycle call: a failure must never block the
 * workspace action it runs alongside, so it is surfaced through the store's
 * non-blocking error channel instead. A zero-watcher result on a workspace
 * that still has readable mounts is treated as a failure (live updates are
 * silently off otherwise) and recorded the same way.
 */
function watchOrReport(workspaceId: string): void {
  void watchWorkspace(workspaceId).then(
    (started) => {
      const workspace = useWorkspaceStore.getState().workspace;
      if (workspace === null || workspace.id !== workspaceId) return;
      if (started === 0 && readableMounts(workspace.mounts).length >= 1) {
        useWorkspaceStore.setState({
          error: "File watching failed: no workspace mounts could be watched. Use Refresh.",
        });
      }
    },
    (err) => {
      useWorkspaceStore.setState({ error: toErrorMessage(err) });
    },
  );
}

function stopWatchingOrReport(): void {
  void stopWatching().catch((err) => {
    useWorkspaceStore.setState({ error: toErrorMessage(err) });
  });
}

function effectiveExclusions(workspace: WorkspaceConfig, mount: MountConfig): string[] {
  return mount.exclusions ?? workspace.exclusions ?? [...DEFAULT_EXCLUSIONS];
}

export { effectiveExclusions };

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
      const updated = await addMountApi(created.id, initialMountPath, "read-write");
      const mount = updated.mounts.find((mount) => mount.path === initialMountPath);
      let scanError: string | null = null;
      let tree: FileTreeNode[] | undefined;
      if (
        mount !== undefined &&
        (mount.permission === "read-write" || mount.permission === "read-only")
      ) {
        try {
          tree = await scanRoot(initialMountPath, effectiveExclusions(updated, mount));
        } catch (err) {
          scanError = toErrorMessage(err);
        }
      }
      set({
        workspace: updated,
        treeByMount: tree !== undefined ? { [initialMountPath]: tree } : {},
        error: scanError,
      });
      watchOrReport(updated.id);
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
      watchOrReport(config.id);
    } catch (err) {
      set({ workspace: previousWorkspace, treeByMount: previousTrees, error: toErrorMessage(err) });
    }
  },
  switchToWelcome: () => {
    stopWatchingOrReport();
    useEditorStore.getState().clearDocument();
    set({ workspace: null, treeByMount: {}, error: null });
  },
  addMount: async (path, permission) => {
    const workspace = get().workspace;
    if (workspace === null) return;
    try {
      const updated = await addMountApi(workspace.id, path, permission);
      const mount = updated.mounts.find((mount) => mount.path === path);
      let scanError: string | null = null;
      let tree: FileTreeNode[] | undefined;
      if (
        mount !== undefined &&
        (mount.permission === "read-write" || mount.permission === "read-only")
      ) {
        try {
          tree = await scanRoot(path, effectiveExclusions(updated, mount));
        } catch (err) {
          scanError = toErrorMessage(err);
        }
      }
      set({
        workspace: updated,
        treeByMount:
          tree !== undefined ? { ...get().treeByMount, [path]: tree } : get().treeByMount,
        error: scanError,
      });
      watchOrReport(workspace.id);
    } catch (err) {
      set({ error: toErrorMessage(err) });
    }
  },
  removeMount: async (path) => {
    const workspace = get().workspace;
    if (workspace === null) return;
    if (!useEditorStore.getState().closeIfInMount(path)) return;
    try {
      const updated = await removeMountApi(workspace.id, path);
      const treeByMount = { ...get().treeByMount };
      delete treeByMount[path];
      set({ workspace: updated, treeByMount, error: null });
      watchOrReport(workspace.id);
    } catch (err) {
      set({ error: toErrorMessage(err) });
    }
  },
  setMountPermission: async (path, permission) => {
    const workspace = get().workspace;
    if (workspace === null) return;
    try {
      const updated = await setMountPermissionApi(workspace.id, path, permission);
      set({ workspace: updated, error: null });
      watchOrReport(workspace.id);
    } catch (err) {
      set({ error: toErrorMessage(err) });
    }
  },
  updateMountExclusions: async (path, exclusions) => {
    const workspace = get().workspace;
    if (workspace === null) return;
    try {
      const updated = await updateMountExclusionsApi(workspace.id, path, exclusions);
      const mount = updated.mounts.find((mount) => mount.path === path);
      const treeByMount = { ...get().treeByMount };
      if (
        mount !== undefined &&
        (mount.permission === "read-write" || mount.permission === "read-only")
      ) {
        treeByMount[path] = await scanRoot(path, effectiveExclusions(updated, mount));
      } else {
        delete treeByMount[path];
      }
      set({ workspace: updated, treeByMount, error: null });
      watchOrReport(workspace.id);
    } catch (err) {
      set({ error: toErrorMessage(err) });
    }
  },
  updateWorkspaceExclusions: async (exclusions) => {
    const workspace = get().workspace;
    if (workspace === null) return;
    try {
      const updated = await updateWorkspaceExclusionsApi(workspace.id, exclusions);
      const next: Record<string, FileTreeNode[]> = {};
      for (const mount of readableMounts(updated.mounts)) {
        next[mount.path] = await scanRoot(mount.path, effectiveExclusions(updated, mount));
      }
      set({ workspace: updated, treeByMount: next, error: null });
      watchOrReport(workspace.id);
    } catch (err) {
      set({ error: toErrorMessage(err) });
    }
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
