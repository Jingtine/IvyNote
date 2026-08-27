import { useEffect, useState } from "react";

import { FileTree } from "../features/files/FileTree";
import { containsMarkdownPath } from "../features/files/fileTreeUtils";
import { MarkdownSourceEditor } from "../features/editor/MarkdownSourceEditor";
import { EditorToolbar } from "../features/editor/EditorToolbar";
import { UnsavedChangesDialog } from "../features/editor/UnsavedChangesDialog";
import { useEditorStore } from "../features/editor/editorStore";
import { MountManager } from "../features/workspace/MountManager";
import { WelcomeScreen } from "../features/workspace/WelcomeScreen";
import { useWorkspaceStore } from "../features/workspace/workspaceStore";

function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] ?? path;
}

type LifecycleAction =
  | { type: "switchWorkspace" }
  | { type: "removeMount"; mountPath: string };

export function App() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const treeByMount = useWorkspaceStore((state) => state.treeByMount);
  const refreshTree = useWorkspaceStore((state) => state.refreshTree);
  const switchToWelcome = useWorkspaceStore((state) => state.switchToWelcome);
  const removeMount = useWorkspaceStore((state) => state.removeMount);
  const workspaceError = useWorkspaceStore((state) => state.error);

  const activeDocument = useEditorStore((state) => state.document);
  const pendingPath = useEditorStore((state) => state.pendingPath);
  const dirty = useEditorStore((state) => state.dirty);
  const draft = useEditorStore((state) => state.draft);
  const loading = useEditorStore((state) => state.loading);
  const error = useEditorStore((state) => state.error);
  const fileMissing = useEditorStore((state) => state.fileMissing);
  const requestOpenDocument = useEditorStore((state) => state.requestOpenDocument);
  const saveAndOpenPending = useEditorStore((state) => state.saveAndOpenPending);
  const discardAndOpenPending = useEditorStore((state) => state.discardAndOpenPending);
  const cancelOpenRequest = useEditorStore((state) => state.cancelOpenRequest);
  const save = useEditorStore((state) => state.save);
  const setDraft = useEditorStore((state) => state.setDraft);
  const setFileMissing = useEditorStore((state) => state.setFileMissing);

  const [mountsOpen, setMountsOpen] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction | null>(null);

  const handleOpenMarkdown = (path: string) => {
    requestOpenDocument(path);
  };

  useEffect(() => {
    const inTree = Object.values(treeByMount).some((tree) =>
      containsMarkdownPath(tree, activeDocument?.path ?? ""),
    );
    const missing = activeDocument !== null && !inTree;
    setFileMissing(missing);
  }, [treeByMount, activeDocument, setFileMissing]);

  const handleSwitchWorkspace = () => {
    if (lifecycleAction !== null || pendingPath !== null) return;
    if (dirty && activeDocument !== null) {
      cancelOpenRequest();
      setLifecycleAction({ type: "switchWorkspace" });
      return;
    }
    switchToWelcome();
  };

  const handleRemoveMount = (path: string) => {
    if (lifecycleAction !== null || pendingPath !== null) return;
    const hostsActiveDocument =
      activeDocument !== null &&
      containsMarkdownPath(treeByMount[path] ?? [], activeDocument.path);
    if (dirty && activeDocument !== null && hostsActiveDocument) {
      cancelOpenRequest();
      setLifecycleAction({ type: "removeMount", mountPath: path });
      return;
    }
    void removeMount(path);
  };

  const handleSaveLifecycle = async () => {
    if (lifecycleAction === null) return;
    const saved = await save();
    if (!saved) return;
    const action = lifecycleAction;
    setLifecycleAction(null);
    if (action.type === "switchWorkspace") {
      switchToWelcome();
    } else {
      void removeMount(action.mountPath);
    }
  };

  const handleDiscardLifecycle = () => {
    if (lifecycleAction === null) return;
    const action = lifecycleAction;
    setLifecycleAction(null);
    if (action.type === "switchWorkspace") {
      switchToWelcome();
    } else {
      void removeMount(action.mountPath);
    }
  };

  const handleCancelLifecycle = () => {
    setLifecycleAction(null);
  };

  if (workspace === null) {
    return (
      <main role="application" aria-label="Local Knowledge IDE">
        <WelcomeScreen />
      </main>
    );
  }

  const mountEntries = Object.entries(treeByMount);

  const lifecycleBlockedMessage = fileMissing
    ? "This file is missing on disk, so saving is disabled. Your draft has been kept; choose Discard to proceed without saving, or Cancel."
    : null;

  const lifecycleDialog =
    lifecycleAction !== null && activeDocument !== null ? (
      lifecycleAction.type === "switchWorkspace" ? (
        <UnsavedChangesDialog
          currentFileName={fileNameOf(activeDocument.path)}
          targetFileName="a different workspace"
          blockedMessage={lifecycleBlockedMessage}
          message={`${fileNameOf(activeDocument.path)} has unsaved changes. Save them before switching workspace?`}
          saveLabel="Save and Switch"
          discardLabel="Discard and Switch"
          onSaveAndOpen={() => void handleSaveLifecycle()}
          onDiscardAndOpen={handleDiscardLifecycle}
          onCancel={handleCancelLifecycle}
        />
      ) : (
        <UnsavedChangesDialog
          currentFileName={fileNameOf(activeDocument.path)}
          targetFileName="another mount"
          blockedMessage={lifecycleBlockedMessage}
          message={`${fileNameOf(activeDocument.path)} has unsaved changes. Save them before removing this mount?`}
          saveLabel="Save and Remove Mount"
          discardLabel="Discard and Remove Mount"
          onSaveAndOpen={() => void handleSaveLifecycle()}
          onDiscardAndOpen={handleDiscardLifecycle}
          onCancel={handleCancelLifecycle}
        />
      )
    ) : null;

  return (
    <main role="application" aria-label="Local Knowledge IDE">
      <header aria-label="Workspace header" className="app-header">
        <span className="app-header__workspace-name">{workspace.name}</span>
        <button type="button" onClick={handleSwitchWorkspace}>
          Switch Workspace
        </button>
        <button type="button" onClick={() => setMountsOpen((open) => !open)}>
          Mounts
        </button>
      </header>
      {mountsOpen && <MountManager onRemoveMount={handleRemoveMount} />}
      <aside aria-label="File explorer">
        <div className="file-explorer__header">
          <button type="button" onClick={() => void refreshTree()}>
            Refresh
          </button>
          {workspaceError !== null && (
            <p role="alert" className="file-explorer__error">
              {workspaceError}
            </p>
          )}
        </div>
        {mountEntries.length === 0 ? (
          <p>This workspace has no mounts yet.</p>
        ) : (
          <FileTree
            mounts={workspace.mounts}
            treeByMount={treeByMount}
            onOpenMarkdown={handleOpenMarkdown}
          />
        )}
      </aside>
      <section aria-label="Editor">
        {error !== null && (
          <p role="alert" className="editor-error">
            {error}
          </p>
        )}
        {activeDocument === null ? (
          loading ? <p>Loading document…</p> : <p>No document open. Select a Markdown file.</p>
        ) : (
          <>
            <EditorToolbar />
            <MarkdownSourceEditor value={draft} onChange={setDraft} />
          </>
        )}
      </section>
      {activeDocument !== null && pendingPath !== null && (
        <UnsavedChangesDialog
          currentFileName={fileNameOf(activeDocument.path)}
          targetFileName={fileNameOf(pendingPath)}
          blockedMessage={
            fileMissing
              ? "This file is missing on disk, so saving is disabled. Your draft has been kept; choose Discard and Open to proceed without saving, or Cancel."
              : null
          }
          onSaveAndOpen={() => void saveAndOpenPending()}
          onDiscardAndOpen={() => void discardAndOpenPending()}
          onCancel={cancelOpenRequest}
        />
      )}
      {lifecycleDialog}
    </main>
  );
}
