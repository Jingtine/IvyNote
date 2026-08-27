import type { FileTreeNode } from "./fileTypes";

function compareNodes(a: FileTreeNode, b: FileTreeNode): number {
  if (a.kind !== b.kind) {
    return a.kind === "directory" ? -1 : 1;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export function sortTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children === undefined ? undefined : sortTreeNodes(node.children),
    }))
    .sort(compareNodes);
}

export function containsMarkdownPath(nodes: readonly FileTreeNode[], path: string): boolean {
  return nodes.some(
    (node) =>
      (node.kind === "markdown" && node.path === path) ||
      (node.children !== undefined && containsMarkdownPath(node.children, path)),
  );
}
