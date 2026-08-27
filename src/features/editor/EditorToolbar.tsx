import { useEffect } from "react";

import { shortenRootPath } from "../../shared/utils/pathDisplay";
import { useEditorStore } from "./editorStore";

function fileName(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] ?? path;
}

export function EditorToolbar() {
  const document = useEditorStore((state) => state.document);
  const dirty = useEditorStore((state) => state.dirty);
  const saving = useEditorStore((state) => state.saving);
  const conflict = useEditorStore((state) => state.conflict);
  const save = useEditorStore((state) => state.save);
  const loadDocument = useEditorStore((state) => state.loadDocument);
  const dismissConflict = useEditorStore((state) => state.dismissConflict);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  if (document === null) return null;

  return (
    <div className="editor-toolbar">
      <span className="editor-toolbar__name">{fileName(document.path)}</span>
      <span className="editor-toolbar__path" title={document.path}>
        {shortenRootPath(document.path)}
      </span>
      {dirty && (
        <span className="editor-toolbar__dirty" title="Unsaved changes">
          ● Unsaved
        </span>
      )}
      <button
        type="button"
        className="editor-toolbar__save"
        onClick={() => void save()}
        disabled={!dirty || saving}
      >
        Save
      </button>
      {conflict && (
        <div role="alert" className="editor-toolbar__conflict">
          <p className="editor-toolbar__conflict-message">
            This file changed outside the app. Your draft has not been overwritten.
          </p>
          <button
            type="button"
            className="editor-toolbar__conflict-reload"
            onClick={() => {
              dismissConflict();
              void loadDocument(document.path);
            }}
          >
            Reload from disk
          </button>
          <button
            type="button"
            className="editor-toolbar__conflict-keep"
            onClick={dismissConflict}
          >
            Keep editing
          </button>
        </div>
      )}
    </div>
  );
}
