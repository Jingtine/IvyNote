import { useState } from "react";

import { shortenRootPath } from "../../shared/utils/pathDisplay";
import type { MountConfig } from "../workspace/workspaceConfig";
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog";
import { FileTreeItem } from "./FileTreeItem";
import type { CutState, FileItemAction } from "./FileTreeItem";
import { NewItemDialog } from "./NewItemDialog";
import { RenameDialog } from "./RenameDialog";
import { createItem, deleteItem, moveItem, renameItem } from "./fileOps";
import { sortTreeNodes } from "./fileTreeUtils";
import type { FileTreeNode } from "./fileTypes";

interface FileTreeProps {
  mounts: MountConfig[];
  treeByMount: Record<string, FileTreeNode[]>;
  onOpenMarkdown: (path: string) => void;
}

type DialogState =
  | { kind: "new-folder"; parentPath: string }
  | { kind: "new-markdown"; parentPath: string }
  | { kind: "rename"; path: string }
  | { kind: "delete"; path: string }
  | null;

function baseName(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] ?? path;
}

export function FileTree({ mounts, treeByMount, onOpenMarkdown }: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<ReadonlySet<string>>(() => new Set());
  const [cut, setCut] = useState<CutState | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [mountMenuOpen, setMountMenuOpen] = useState<string | null>(null);

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

  const handleRequestAction = (action: FileItemAction) => {
    switch (action.type) {
      case "new-folder":
        setDialog({ kind: "new-folder", parentPath: action.parentPath });
        break;
      case "new-markdown":
        setDialog({ kind: "new-markdown", parentPath: action.parentPath });
        break;
      case "rename":
        setDialog({ kind: "rename", path: action.path });
        break;
      case "delete":
        setDialog({ kind: "delete", path: action.path });
        break;
      case "cut":
        setCut({ path: action.path, mountPath: action.mountPath });
        break;
      case "paste": {
        const current = cut;
        if (current === null) break;
        void moveItem(current.path, action.path).then((ok) => {
          if (ok) setCut(null);
        });
        break;
      }
    }
  };

  const visibleMounts = mounts.filter((mount) => mount.permission !== "excluded");

  return (
    <nav className="file-tree">
      {visibleMounts.map((mount) => {
        const readOnly = mount.permission === "read-only";
        const tree = treeByMount[mount.path] ?? [];
        const mountLabel = shortenRootPath(mount.path);
        const canPasteIntoRoot = cut !== null && cut.mountPath === mount.path && !readOnly;
        return (
          <section
            key={mount.path}
            aria-label={`Mount ${mount.path}`}
            className="file-tree__mount"
          >
            <header className="file-tree__mount-header">
              <h2 className="file-tree__mount-title" title={mount.path}>
                {mountLabel}
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
              {!readOnly && (
                <div
                  className="file-tree__mount-actions"
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setMountMenuOpen(null);
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Actions for ${mountLabel}`}
                    aria-haspopup="menu"
                    aria-expanded={mountMenuOpen === mount.path}
                    className="file-tree__mount-menu-button"
                    onClick={() =>
                      setMountMenuOpen((current) => (current === mount.path ? null : mount.path))
                    }
                  >
                    ⋯
                  </button>
                  {mountMenuOpen === mount.path && (
                    <div
                      role="menu"
                      aria-label={`Actions for ${mountLabel}`}
                      className="file-tree__mount-menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMountMenuOpen(null);
                          setDialog({ kind: "new-folder", parentPath: mount.path });
                        }}
                      >
                        New Folder
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMountMenuOpen(null);
                          setDialog({ kind: "new-markdown", parentPath: mount.path });
                        }}
                      >
                        New Markdown
                      </button>
                      {canPasteIntoRoot && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMountMenuOpen(null);
                            handleRequestAction({ type: "paste", path: mount.path });
                          }}
                        >
                          Paste
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </header>
            <ul role="tree" aria-label="File tree" className="file-tree__list">
              {sortTreeNodes(tree).map((node) => (
                <FileTreeItem
                  key={node.path}
                  node={node}
                  depth={0}
                  expandedPaths={expandedPaths}
                  mountPath={mount.path}
                  readOnly={readOnly}
                  cut={cut}
                  onToggleDirectory={toggleDirectory}
                  onOpenMarkdown={onOpenMarkdown}
                  onRequestAction={handleRequestAction}
                />
              ))}
            </ul>
          </section>
        );
      })}

      {dialog?.kind === "new-folder" && (
        <NewItemDialog
          kind="folder"
          parentPath={dialog.parentPath}
          onConfirm={(name) => {
            const parentPath = dialog.parentPath;
            setDialog(null);
            void createItem("folder", parentPath, name);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "new-markdown" && (
        <NewItemDialog
          kind="markdown"
          parentPath={dialog.parentPath}
          onConfirm={(name) => {
            const parentPath = dialog.parentPath;
            setDialog(null);
            void createItem("markdown", parentPath, name);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "rename" && (
        <RenameDialog
          currentName={baseName(dialog.path)}
          onConfirm={(newName) => {
            const path = dialog.path;
            setDialog(null);
            void renameItem(path, newName);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDeleteDialog
          name={baseName(dialog.path)}
          onConfirm={() => {
            const path = dialog.path;
            setDialog(null);
            void deleteItem(path);
          }}
          onCancel={() => setDialog(null)}
        />
      )}
    </nav>
  );
}
