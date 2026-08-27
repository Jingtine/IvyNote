import { useState } from "react";

import { shortenRootPath } from "../../shared/utils/pathDisplay";
import type { MountConfig } from "../workspace/workspaceConfig";
import { FileTreeItem } from "./FileTreeItem";
import { sortTreeNodes } from "./fileTreeUtils";
import type { FileTreeNode } from "./fileTypes";

interface FileTreeProps {
  mounts: MountConfig[];
  treeByMount: Record<string, FileTreeNode[]>;
  onOpenMarkdown: (path: string) => void;
}

export function FileTree({ mounts, treeByMount, onOpenMarkdown }: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set());

  const toggleDirectory = (path: string) => {
    setExpandedPaths((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const visibleMounts = mounts.filter((mount) => mount.permission !== "excluded");

  return (
    <nav className="file-tree">
      {visibleMounts.map((mount) => {
        const readOnly = mount.permission === "read-only";
        const tree = treeByMount[mount.path] ?? [];
        return (
          <section
            key={mount.path}
            aria-label={`Mount ${mount.path}`}
            className="file-tree__mount"
          >
            <header className="file-tree__mount-header">
              <h2 className="file-tree__mount-title" title={mount.path}>
                {shortenRootPath(mount.path)}
              </h2>
              <span className="file-tree__permission-badge">{mount.permission}</span>
              {readOnly && (
                <span
                  role="img"
                  aria-label="read-only"
                  className="file-tree__readonly-marker"
                >
                  🔒
                </span>
              )}
            </header>
            <ul role="tree" aria-label="File tree" className="file-tree__list">
              {sortTreeNodes(tree).map((node) => (
                <FileTreeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  expandedPaths={expandedPaths}
                  onToggleDirectory={toggleDirectory}
                  onOpenMarkdown={onOpenMarkdown}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </nav>
  );
}
