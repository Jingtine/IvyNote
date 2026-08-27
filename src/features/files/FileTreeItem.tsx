import type { KeyboardEvent } from "react";

import type { FileTreeNode } from "./fileTypes";

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
  expandedPaths: ReadonlySet<string>;
  onToggleDirectory: (path: string) => void;
  onOpenMarkdown: (path: string) => void;
}

export function FileTreeItem({
  node,
  depth,
  expandedPaths,
  onToggleDirectory,
  onOpenMarkdown,
}: FileTreeItemProps) {
  const isDirectory = node.kind === "directory";
  const expanded = expandedPaths.has(node.path);

  const activate = () => {
    if (isDirectory) {
      onToggleDirectory(node.path);
    } else {
      onOpenMarkdown(node.path);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    activate();
  };

  return (
    <li>
      <div
        role="treeitem"
        aria-expanded={isDirectory ? expanded : undefined}
        tabIndex={0}
        className={
          isDirectory
            ? "file-tree-item file-tree-item--directory"
            : "file-tree-item file-tree-item--markdown"
        }
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={activate}
        onKeyDown={handleKeyDown}
      >
        {isDirectory && (
          <span aria-hidden="true" className="file-tree-item__indicator">
            {expanded ? "▾" : "▸"}
          </span>
        )}
        <span className="file-tree-item__name">{node.name}</span>
        {!isDirectory && (
          <span aria-hidden="true" className="file-tree-item__badge">
            MD
          </span>
        )}
      </div>
      {isDirectory && expanded && node.children !== undefined && node.children.length > 0 && (
        <ul role="group" className="file-tree-group">
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggleDirectory={onToggleDirectory}
              onOpenMarkdown={onOpenMarkdown}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
