import { FileTree } from "../features/files/FileTree";
import { MarkdownSourceEditor } from "../features/editor/MarkdownSourceEditor";
import { EditorToolbar } from "../features/editor/EditorToolbar";
import { useEditorStore } from "../features/editor/editorStore";
import { WorkspacePicker } from "../features/workspace/WorkspacePicker";
import { useWorkspaceStore } from "../features/workspace/workspaceStore";

export function App() {
  const rootPath = useWorkspaceStore((state) => state.rootPath);
  const tree = useWorkspaceStore((state) => state.tree);

  const activeDocument = useEditorStore((state) => state.document);
  const draft = useEditorStore((state) => state.draft);
  const dirty = useEditorStore((state) => state.dirty);
  const loading = useEditorStore((state) => state.loading);
  const error = useEditorStore((state) => state.error);
  const loadDocument = useEditorStore((state) => state.loadDocument);
  const setDraft = useEditorStore((state) => state.setDraft);

  const handleOpenMarkdown = (path: string) => {
    void loadDocument(path);
  };

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
        <FileTree tree={tree} rootPath={rootPath} onOpenMarkdown={handleOpenMarkdown} />
      </aside>
      <section aria-label="Editor">
        {activeDocument === null ? (
          loading ? <p>Loading document…</p> : <p>No document open. Select a Markdown file.</p>
        ) : (
          <>
            <EditorToolbar document={activeDocument} dirty={dirty} />
            {error !== null && (
              <p role="alert" className="editor-error">
                {error}
              </p>
            )}
            <MarkdownSourceEditor value={draft} onChange={setDraft} />
          </>
        )}
      </section>
    </main>
  );
}
