import { useState } from "react";

import { shortenRootPath } from "../../shared/utils/pathDisplay";
import { FileTreeItem } from "./FileTreeItem";
import { sortTreeNodes } from "./fileTreeUtils";
import type { FileTreeNode } from "./fileTypes";

interface FileTreeProps {
  tree: FileTreeNode[];
  rootPath?: string;
  onOpenMarkdown: (path: string) => void;
}

export function FileTree({ tree, rootPath, onOpenMarkdown }: FileTreeProps) {
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

  return (
    <nav className="file-tree">
      {rootPath !== undefined && (
        <p className="file-tree__root" title={rootPath}>
          {shortenRootPath(rootPath)}
        </p>
      )}
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
    </nav>
  );
}
