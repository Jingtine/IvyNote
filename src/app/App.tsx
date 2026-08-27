import { useEffect } from "react";

import { FileTree } from "../features/files/FileTree";
import { containsMarkdownPath } from "../features/files/fileTreeUtils";
import { MarkdownSourceEditor } from "../features/editor/MarkdownSourceEditor";
import { EditorToolbar } from "../features/editor/EditorToolbar";
import { UnsavedChangesDialog } from "../features/editor/UnsavedChangesDialog";
import { useEditorStore } from "../features/editor/editorStore";
import { WorkspacePicker } from "../features/workspace/WorkspacePicker";
import { useWorkspaceStore } from "../features/workspace/workspaceStore";

function fileNameOf(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] ?? path;
}

export function App() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const treeByMount = useWorkspaceStore((state) => state.treeByMount);
  const refreshTree = useWorkspaceStore((state) => state.refreshTree);
  const switchToWelcome = useWorkspaceStore((state) => state.switchToWelcome);
  const workspaceError = useWorkspaceStore((state) => state.error);

  const activeDocument = useEditorStore((state) => state.document);
  const pendingPath = useEditorStore((state) => state.pendingPath);
  const draft = useEditorStore((state) => state.draft);
  const loading = useEditorStore((state) => state.loading);
  const error = useEditorStore((state) => state.error);
  const fileMissing = useEditorStore((state) => state.fileMissing);
  const requestOpenDocument = useEditorStore((state) => state.requestOpenDocument);
  const saveAndOpenPending = useEditorStore((state) => state.saveAndOpenPending);
  const discardAndOpenPending = useEditorStore((state) => state.discardAndOpenPending);
  const cancelOpenRequest = useEditorStore((state) => state.cancelOpenRequest);
  const setDraft = useEditorStore((state) => state.setDraft);
  const setFileMissing = useEditorStore((state) => state.setFileMissing);

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

  if (workspace === null) {
    return (
      <main role="application" aria-label="Local Knowledge IDE">
        <section aria-label="Welcome">
          <h1>Local Knowledge IDE</h1>
          <p>No workspace selected</p>
          <button type="button" onClick={() => switchToWelcome()}>
            Create a workspace
          </button>
        </section>
      </main>
    );
  }

  const mountEntries = Object.entries(treeByMount);

  return (
    <main role="application" aria-label="Local Knowledge IDE">
      <header aria-label="Workspace header">
        <WorkspacePicker />
      </header>
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
    </main>
  );
}
