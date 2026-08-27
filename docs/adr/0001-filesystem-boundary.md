# ADR 0001: Filesystem Access Stays Behind the Rust Boundary

Date: 2026-08-27

Status: Accepted (v0.1)

## Context

The application edits real user files and must preserve local-first safety. Any component that can read or write arbitrary paths is a data-loss and security risk, so the trust boundary for filesystem access must be explicit from the first milestone.

## Decision

React/TypeScript never performs unrestricted filesystem access. UI calls typed Tauri commands; Rust validates paths and performs I/O.

Concretely, in v0.1:

- The frontend's only filesystem entry points are thin service wrappers that `invoke` typed Tauri commands:
  - `scan_root(root)` via `src/features/workspace/workspaceApi.ts`
  - `read_markdown_file(path)` via `src/features/files/fileApi.ts`
  - `save_markdown_file(request)` via `src/features/files/fileApi.ts`
- The commands (`src-tauri/src/commands/workspace.rs`, `src-tauri/src/commands/files.rs`) are thin delegation only; all logic lives in the Rust services:
  - Scanner (`src-tauri/src/filesystem/scanner.rs`) canonicalizes the root once, rejects non-directory roots, skips symlinked directories, and never reads file contents.
  - Reader (`src-tauri/src/filesystem/reader.rs`) and writer (`src-tauri/src/filesystem/writer.rs`) enforce the command-boundary rule that only `.md` paths (case-insensitive) may be read or written; anything else is rejected as `InvalidPath`.
- The Tauri capability file (`src-tauri/capabilities/default.json`) grants only `core:default`. No Tauri filesystem plugin (`tauri-plugin-fs`) is present on either side of the boundary, so the webview has no direct file read/write capability to misuse.
- The one additional plugin the UI uses is `@tauri-apps/plugin-dialog` for the native "Open Folder" picker. It only returns a path string chosen by the user; all scanning and I/O for that path still go through the Rust commands above.

## Alternatives

- Tauri filesystem plugin exposed directly to UI — rejected: any compromised or buggy frontend code could read/write arbitrary paths, and there would be no single place to enforce validation, conflict checks, or a future permission model.
- Node/Electron filesystem access — rejected: out of scope for the Tauri stack, and it would recreate the same unrestricted-access problem in the main process.
- Database-backed documents — rejected: violates the local-first, open-format requirement (real Markdown files are the source of truth).

## Consequences

- Slightly more boilerplate: every new filesystem operation needs a typed command, a service function, and a TS wrapper.
- Centralized security and error handling: path validation, canonicalization, symlink handling, and the typed `AppError` mapping live in one Rust boundary.
- Easier future permission model: when scoping or user-granted roots arrive, only the Rust boundary needs to change; the UI contract stays stable.

## Migration

None for v0.1.
