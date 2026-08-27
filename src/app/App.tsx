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
  const rootPath = useWorkspaceStore((state) => state.rootPath);
  const tree = useWorkspaceStore((state) => state.tree);
  const refreshTree = useWorkspaceStore((state) => state.refreshTree);

  const activeDocument = useEditorStore((state) => state.document);
  const pendingPath = useEditorStore((state) => state.pendingPath);
  const draft = useEditorStore((state) => state.draft);
  const loading = useEditorStore((state) => state.loading);
  const error = useEditorStore((state) => state.error);
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
    const missing = activeDocument !== null && !containsMarkdownPath(tree, activeDocument.path);
    setFileMissing(missing);
  }, [tree, activeDocument, setFileMissing]);

  if (rootPath === null) {
    return (
      <main role="application" aria-label="Local Knowledge IDE">
        <section aria-label="Welcome">
          <h1>Local Knowledge IDE</h1>
          <p>Open a local folder to begin</p>
          <WorkspacePicker />
        </section>
      </main>
    );
  }

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
        </div>
        <FileTree tree={tree} rootPath={rootPath} onOpenMarkdown={handleOpenMarkdown} />
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
          onSaveAndOpen={() => void saveAndOpenPending()}
          onDiscardAndOpen={() => void discardAndOpenPending()}
          onCancel={cancelOpenRequest}
        />
      )}
    </main>
  );
}
