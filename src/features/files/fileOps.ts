import {
  createFolder,
  createMarkdown,
  deleteToTrash,
  movePath,
  renamePath,
} from "./fileApi";
import type { FileTreeNode } from "./fileTypes";
import type { MountConfig, WorkspaceConfig } from "../workspace/workspaceConfig";
import { useWorkspaceStore } from "../workspace/workspaceStore";

export type FileOpKind = "folder" | "markdown";

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function separatorOf(path: string): string {
  return path.includes("/") ? "/" : "\\";
}

function joinPath(parent: string, name: string): string {
  const sep = separatorOf(parent);
  const base = parent.endsWith("/") || parent.endsWith("\\") ? parent.slice(0, -1) : parent;
  return `${base}${sep}${name}`;
}

function mountForPath(workspace: WorkspaceConfig, path: string): MountConfig | null {
  return (
    workspace.mounts.find((mount) => {
      const sep = separatorOf(mount.path);
      const prefix = mount.path.endsWith(sep) ? mount.path : `${mount.path}${sep}`;
      return path === mount.path || path.startsWith(prefix);
    }) ?? null
  );
}

function findNode(nodes: readonly FileTreeNode[], path: string): FileTreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.children !== undefined) {
      const found = findNode(node.children, path);
      if (found !== null) return found;
    }
  }
  return null;
}

function insertChild(
  nodes: FileTreeNode[],
  parentPath: string,
  child: FileTreeNode,
): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.path === parentPath) {
      return { ...node, children: [...(node.children ?? []), child] };
    }
    if (node.children !== undefined) {
      return { ...node, children: insertChild(node.children, parentPath, child) };
    }
    return node;
  });
}

function addNode(
  tree: Record<string, FileTreeNode[]>,
  mountPath: string,
  parentPath: string,
  child: FileTreeNode,
): Record<string, FileTreeNode[]> {
  const root = tree[mountPath] ?? [];
  const next = parentPath === mountPath ? [...root, child] : insertChild(root, parentPath, child);
  return { ...tree, [mountPath]: next };
}

function removeChild(nodes: FileTreeNode[], path: string): FileTreeNode[] {
  return nodes
    .filter((node) => node.path !== path)
    .map((node) =>
      node.children === undefined ? node : { ...node, children: removeChild(node.children, path) },
    );
}

function replaceNode(
  nodes: FileTreeNode[],
  path: string,
  replacement: FileTreeNode,
): FileTreeNode[] {
  return nodes.map((node) => {
    if (node.path === path) return replacement;
    if (node.children !== undefined) {
      return { ...node, children: replaceNode(node.children, path, replacement) };
    }
    return node;
  });
}

function remapPaths(node: FileTreeNode, oldPrefix: string, newPrefix: string): FileTreeNode {
  const path = node.path.startsWith(oldPrefix)
    ? newPrefix + node.path.slice(oldPrefix.length)
    : node.path;
  return {
    ...node,
    path,
    children: node.children?.map((child) => remapPaths(child, oldPrefix, newPrefix)),
  };
}

function relocatedNode(node: FileTreeNode, sourcePath: string, newPath: string): FileTreeNode {
  const sep = separatorOf(sourcePath);
  return {
    ...node,
    path: newPath,
    children: node.children?.map((child) =>
      remapPaths(child, `${sourcePath}${sep}`, `${newPath}${sep}`),
    ),
  };
}

export async function createItem(
  kind: FileOpKind,
  parentPath: string,
  name: string,
): Promise<boolean> {
  const store = useWorkspaceStore.getState();
  const { workspace, treeByMount } = store;
  if (workspace === null) return false;
  const mount = mountForPath(workspace, parentPath);
  if (mount === null || mount.permission !== "read-write") return false;
  const node: FileTreeNode = {
    name,
    path: joinPath(parentPath, name),
    kind: kind === "folder" ? "directory" : "markdown",
    ...(kind === "folder" ? { children: [] } : {}),
  };
  const previous = treeByMount;
  useWorkspaceStore.setState({
    treeByMount: addNode(treeByMount, mount.path, parentPath, node),
    error: null,
  });
  try {
    if (kind === "folder") {
      await createFolder(workspace.id, parentPath, name);
    } else {
      await createMarkdown(workspace.id, parentPath, name);
    }
    await useWorkspaceStore.getState().refreshTree();
    return true;
  } catch (err) {
    useWorkspaceStore.setState({ treeByMount: previous, error: toErrorMessage(err) });
    return false;
  }
}

export async function renameItem(path: string, newName: string): Promise<boolean> {
  const store = useWorkspaceStore.getState();
  const { workspace, treeByMount } = store;
  if (workspace === null) return false;
  const mount = mountForPath(workspace, path);
  if (mount === null || mount.permission !== "read-write") return false;
  const nodes = treeByMount[mount.path] ?? [];
  const node = findNode(nodes, path);
  if (node === null) return false;
  const sep = separatorOf(path);
  const parentPath = path.slice(0, path.lastIndexOf(sep));
  const newPath = joinPath(parentPath, newName);
  const renamed: FileTreeNode = {
    ...node,
    name: newName,
    path: newPath,
    children:
      node.children === undefined
        ? undefined
        : node.children.map((child) =>
            remapPaths(child, `${path}${sep}`, `${newPath}${sep}`),
          ),
  };
  const previous = treeByMount;
  useWorkspaceStore.setState({
    treeByMount: { ...treeByMount, [mount.path]: replaceNode(nodes, path, renamed) },
    error: null,
  });
  try {
    await renamePath(workspace.id, path, newName);
    await useWorkspaceStore.getState().refreshTree();
    return true;
  } catch (err) {
    useWorkspaceStore.setState({ treeByMount: previous, error: toErrorMessage(err) });
    return false;
  }
}

export async function deleteItem(path: string): Promise<boolean> {
  const store = useWorkspaceStore.getState();
  const { workspace, treeByMount } = store;
  if (workspace === null) return false;
  const mount = mountForPath(workspace, path);
  if (mount === null || mount.permission !== "read-write") return false;
  const previous = treeByMount;
  useWorkspaceStore.setState({
    treeByMount: {
      ...treeByMount,
      [mount.path]: removeChild(treeByMount[mount.path] ?? [], path),
    },
    error: null,
  });
  try {
    await deleteToTrash(workspace.id, path);
    await useWorkspaceStore.getState().refreshTree();
    return true;
  } catch (err) {
    useWorkspaceStore.setState({ treeByMount: previous, error: toErrorMessage(err) });
    return false;
  }
}

export async function moveItem(path: string, targetDir: string): Promise<boolean> {
  const store = useWorkspaceStore.getState();
  const { workspace, treeByMount } = store;
  if (workspace === null) return false;
  const sourceMount = mountForPath(workspace, path);
  const targetMount = mountForPath(workspace, targetDir);
  if (sourceMount === null || targetMount === null) return false;
  if (sourceMount.path !== targetMount.path) return false;
  if (sourceMount.permission !== "read-write") return false;
  const nodes = treeByMount[sourceMount.path] ?? [];
  const node = findNode(nodes, path);
  if (node === null) return false;
  const relocated = relocatedNode(node, path, joinPath(targetDir, node.name));
  const previous = treeByMount;
  useWorkspaceStore.setState({
    treeByMount: {
      ...treeByMount,
      [sourceMount.path]: insertChild(removeChild(nodes, path), targetDir, relocated),
    },
    error: null,
  });
  try {
    await movePath(workspace.id, path, targetDir);
    await useWorkspaceStore.getState().refreshTree();
    return true;
  } catch (err) {
    useWorkspaceStore.setState({ treeByMount: previous, error: toErrorMessage(err) });
    return false;
  }
}
