interface UnsavedChangesDialogProps {
  currentFileName: string;
  targetFileName: string;
  onSaveAndOpen(): void;
  onDiscardAndOpen(): void;
  onCancel(): void;
}

export function UnsavedChangesDialog({
  currentFileName,
  targetFileName,
  onSaveAndOpen,
  onDiscardAndOpen,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <div role="dialog" aria-label="Unsaved changes" className="unsaved-changes-dialog">
      <p className="unsaved-changes-dialog__message">
        {currentFileName} has unsaved changes. Save them before opening {targetFileName}?
      </p>
      <div className="unsaved-changes-dialog__actions">
        <button type="button" className="unsaved-changes-dialog__save" onClick={onSaveAndOpen}>
          Save and Open
        </button>
        <button
          type="button"
          className="unsaved-changes-dialog__discard"
          onClick={onDiscardAndOpen}
        >
          Discard and Open
        </button>
        <button type="button" className="unsaved-changes-dialog__cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
