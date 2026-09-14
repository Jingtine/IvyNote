import { useState } from "react";

interface NewItemDialogProps {
  kind: "folder" | "markdown";
  parentPath: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

function parentLabel(parentPath: string): string {
  const segments = parentPath.split(/[\\/]/);
  return segments[segments.length - 1] ?? parentPath;
}

export function NewItemDialog({ kind, parentPath, onConfirm, onCancel }: NewItemDialogProps) {
  const [name, setName] = useState("");
  const title = kind === "folder" ? "New folder" : "New markdown";

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    const finalName = kind === "markdown" && !/\.md$/i.test(trimmed) ? `${trimmed}.md` : trimmed;
    onConfirm(finalName);
  };

  return (
    <div role="dialog" aria-label={title} className="new-item-dialog">
      <p className="new-item-dialog__message">
        {kind === "folder" ? "Create a folder" : "Create a markdown file"} in “{parentLabel(parentPath)}”.
      </p>
      <label className="new-item-dialog__field">
        Name
        <input
          type="text"
          value={name}
          autoFocus
          placeholder={kind === "folder" ? "untitled" : "untitled.md"}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            if (event.key === "Escape") onCancel();
          }}
        />
      </label>
      <div className="new-item-dialog__actions">
        <button
          type="button"
          className="new-item-dialog__create"
          onClick={submit}
          disabled={name.trim().length === 0}
        >
          Create
        </button>
        <button type="button" className="new-item-dialog__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
