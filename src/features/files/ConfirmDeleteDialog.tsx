interface ConfirmDeleteDialogProps {
  name: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteDialog({ name, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  return (
    <div role="dialog" aria-label="Delete to trash" className="confirm-delete-dialog">
      <p className="confirm-delete-dialog__message">
        Move “{name}” to the Trash? You can restore it from the system Trash later.
      </p>
      <div className="confirm-delete-dialog__actions">
        <button type="button" className="confirm-delete-dialog__confirm" onClick={onConfirm}>
          Move to Trash
        </button>
        <button type="button" className="confirm-delete-dialog__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
