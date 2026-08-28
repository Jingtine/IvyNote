# ADR 0004: Delete Sends Files to the OS System Trash

Date: 2026-08-28

Status: Accepted (v0.2)

## Context

Users manage real files from the app and need a way to delete them. Spec §7.1 requires delete to go to the system Trash, and the alpha release channel (spec §45) forbids data loss: a deleted note must be recoverable. The delete boundary also needs to be testable without touching the real OS Recycle Bin (spec §32.2 explicitly allows a mock/abstracted trash boundary).

## Decision

1. **Delete sends the file to the OS Trash / Recycle Bin** via the Rust `trash` crate (`src-tauri/Cargo.toml`, `trash = "5"`). On Windows this is the Recycle Bin with the standard restore flow; the crate abstracts the OS-specific implementation on Windows, macOS, and Linux.

2. **The trash boundary is a `Trash` trait** (`src-tauri/src/filesystem/ops.rs:87`), implemented by `SystemTrash`, which maps `trash::delete` results into the typed `AppError` model. `delete_to_trash` delegates to `delete_to_trash_with(&SystemTrash, path)` (`ops.rs:100`–`107`). Tests use a `MockTrash` that records paths and never touches the filesystem; one real-system test is gated behind the `IVY_TRASH_TEST=1` env var so CI never populates a Recycle Bin (`ops.rs:364`–`371`).

3. **Delete is a read-write-mount operation only.** The `delete_to_trash` Tauri command resolves the mount for the target path and returns `PermissionDenied` unless it is `read-write`, matching the three-layer defense used by all mutating operations (UI disables the action, Rust enforces it, the tree marks read-only mounts) — `src-tauri/src/commands/files.rs:94`–`102`.

4. **Permanent delete is a separate future feature.** v0.2 has no permanent-delete path at all; when it arrives it must be a distinct, double-confirmed action, never the default.

## Alternatives

- **App-internal trash directory** (move deleted files into a hidden `.trash` under the workspace or app data) — rejected: deleted files would not be recoverable through the OS Recycle Bin, and a hidden directory inside user knowledge folders would pollute the source of truth and leak out of the OS's own file-management workflow. Does not satisfy spec §7.1.
- **Soft-delete flag** (a metadata marker or renamed file on disk) — rejected: it is not real file management, it is invisible to external editors and tools, and rewriting user files to record deletion violates the no-silent-rewrite rule.
- **Immediate hard delete** — rejected: unrecoverable, and unacceptable for the alpha no-data-loss channel.

## Consequences

- Deleted notes are recoverable from the OS Recycle Bin until the user empties it; accidental deletes are not data loss.
- Delete behavior is the OS's own: on Windows, files move to the Recycle Bin with the standard restore/empty flow, with no app-specific trash state to sync or migrate.
- The `Trash` trait keeps the delete operation unit-testable and the boundary explicit, consistent with ADR 0001's filesystem-boundary discipline.
- Read-only mounts refuse delete in the UI and in Rust; the file system is the final authority on actual write permission.
- Cross-platform behavior differences in the `trash` crate (e.g. no Recycle Bin on some Linux desktops) surface as OS behavior rather than app logic.

## Migration

None — delete-to-system-Trash is a new v0.2 feature with no prior behavior to migrate.
