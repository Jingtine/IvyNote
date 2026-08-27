import { shortenRootPath } from "../../shared/utils/pathDisplay";
import type { TextDocumentSnapshot } from "../files/fileTypes";

interface EditorToolbarProps {
  document: TextDocumentSnapshot;
  dirty: boolean;
}

function fileName(path: string): string {
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] ?? path;
}

export function EditorToolbar({ document, dirty }: EditorToolbarProps) {
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
    </div>
  );
}
