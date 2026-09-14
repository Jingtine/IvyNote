import { useState } from "react";

interface RenameDialogProps {
  currentName: string;
  onConfirm: (newName: string) => void;
  onCancel: () => void;
}

export function RenameDialog({ currentName, onConfirm, onCancel }: RenameDialogProps) {
  const [name, setName] = useState(currentName);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    onConfirm(trimmed);
  };

  return (
    <div role="dialog" aria-label="Rename" className="rename-dialog">
      <p className="rename-dialog__message">Rename “{currentName}”.</p>
      <label className="rename-dialog__field">
        New name
        <input
          type="text"
          value={name}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            if (event.key === "Escape") onCancel();
          }}
        />
      </label>
      <div className="rename-dialog__actions">
        <button
          type="button"
          className="rename-dialog__confirm"
          onClick={submit}
          disabled={name.trim().length === 0}
        >
          Rename
        </button>
        <button type="button" className="rename-dialog__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
