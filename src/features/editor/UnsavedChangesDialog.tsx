interface UnsavedChangesDialogProps {
  currentFileName: string;
  targetFileName: string;
  blockedMessage?: string | null;
  message?: string;
  saveLabel?: string;
  discardLabel?: string;
  cancelLabel?: string;
  onSaveAndOpen(): void;
  onDiscardAndOpen(): void;
  onCancel(): void;
}

export function UnsavedChangesDialog({
  currentFileName,
  targetFileName,
  blockedMessage,
  message = `${currentFileName} has unsaved changes. Save them before opening ${targetFileName}?`,
  saveLabel = "Save and Open",
  discardLabel = "Discard and Open",
  cancelLabel = "Cancel",
  onSaveAndOpen,
  onDiscardAndOpen,
  onCancel,
}: UnsavedChangesDialogProps) {
  return (
    <div role="dialog" aria-label="Unsaved changes" className="unsaved-changes-dialog">
      <p className="unsaved-changes-dialog__message">{message}</p>
      {blockedMessage !== null && blockedMessage !== undefined && (
        <p role="alert" className="unsaved-changes-dialog__blocked">
          {blockedMessage}
        </p>
      )}
      <div className="unsaved-changes-dialog__actions">
        <button type="button" className="unsaved-changes-dialog__save" onClick={onSaveAndOpen}>
          {saveLabel}
        </button>
        <button
          type="button"
          className="unsaved-changes-dialog__discard"
          onClick={onDiscardAndOpen}
        >
          {discardLabel}
        </button>
        <button type="button" className="unsaved-changes-dialog__cancel" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
