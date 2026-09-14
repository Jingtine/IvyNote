import { useState } from "react";
import type { KeyboardEvent } from "react";

import type { FileTreeNode } from "./fileTypes";

export interface CutState {
  path: string;
  mountPath: string;
}

export type FileItemAction =
  | { type: "new-folder"; parentPath: string }
  | { type: "new-markdown"; parentPath: string }
  | { type: "rename"; path: string }
  | { type: "delete"; path: string }
  | { type: "cut"; path: string; mountPath: string }
  | { type: "paste"; path: string };

interface FileTreeItemProps {
  node: FileTreeNode;
  depth: number;
  expandedPaths: ReadonlySet<string>;
  mountPath: string;
  readOnly: boolean;
  cut: CutState | null;
  onToggleDirectory: (path: string) => void;
  onOpenMarkdown: (path: string) => void;
  onRequestAction: (action: FileItemAction) => void;
}

export function FileTreeItem({
  node,
  depth,
  expandedPaths,
  mountPath,
  readOnly,
  cut,
  onToggleDirectory,
  onOpenMarkdown,
  onRequestAction,
}: FileTreeItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isDirectory = node.kind === "directory";
  const expanded = expandedPaths.has(node.path);
  const isCutItem = cut !== null && cut.path === node.path;
  const showPaste = isDirectory && cut !== null && cut.mountPath === mountPath && cut.path !== node.path;

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

  const request = (action: FileItemAction) => {
    setMenuOpen(false);
    onRequestAction(action);
  };

  return (
    <li className="file-tree-item-row">
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
      {!readOnly && (
        <div
          className="file-tree-item__actions"
          onKeyDown={(event) => {
            if (event.key === "Escape") setMenuOpen(false);
          }}
        >
          <button
            type="button"
            aria-label={`Actions for ${node.name}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="file-tree-item__menu-button"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div role="menu" aria-label={`Actions for ${node.name}`} className="file-tree-item__menu">
              {isDirectory && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => request({ type: "new-folder", parentPath: node.path })}
                >
                  New Folder
                </button>
              )}
              {isDirectory && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => request({ type: "new-markdown", parentPath: node.path })}
                >
                  New Markdown
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => request({ type: "rename", path: node.path })}
              >
                Rename
              </button>
              {!isCutItem && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => request({ type: "cut", path: node.path, mountPath })}
                >
                  Cut
                </button>
              )}
              {showPaste && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => request({ type: "paste", path: node.path })}
                >
                  Paste
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                onClick={() => request({ type: "delete", path: node.path })}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
      {isDirectory && expanded && node.children !== undefined && node.children.length > 0 && (
        <ul role="group" className="file-tree-group">
          {node.children.map((child) => (
            <FileTreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              mountPath={mountPath}
              readOnly={readOnly}
              cut={cut}
              onToggleDirectory={onToggleDirectory}
              onOpenMarkdown={onOpenMarkdown}
              onRequestAction={onRequestAction}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
