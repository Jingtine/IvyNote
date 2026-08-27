import { EditorView } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import CodeMirror from "@uiw/react-codemirror";

export interface MarkdownSourceEditorProps {
  value: string;
  onChange(value: string): void;
}

export function MarkdownSourceEditor({ value, onChange }: MarkdownSourceEditorProps) {
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={[markdown(), EditorView.lineWrapping]}
      aria-label="Markdown source editor"
    />
  );
}
