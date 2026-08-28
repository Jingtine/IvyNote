# Local Knowledge IDE

A local-first, open-format personal knowledge workbench. Local Knowledge IDE edits real local Markdown files; there is no proprietary storage, no vendor lock-in, and no silent data loss.

v0.2 is the Workspace & real file-management milestone: compose several existing local directories into one named Workspace without moving files, manage per-mount read-write/read-only/excluded permissions and exclusion rules, create/rename/move/delete-to-system-Trash real files, and get live external-change updates from a Rust file watcher — all on top of v0.1's safe, atomic CodeMirror editing. Your notes stay ordinary `.md` files on disk; Workspace config lives in the OS AppData directory, never inside your knowledge folders.

> Status: **v0.2.0-alpha (not yet tagged)**. See `docs/release-notes/v0.2.0-alpha.md` for what is supported and explicitly deferred, and the manual smoke checklist below — the tag waits for a desktop run.

## Development Prerequisites

- Node.js 20+ and `pnpm` (https://pnpm.io/installation)
- Rust toolchain (stable) and `cargo` (https://rustup.rs)
- Tauri system prerequisites for your platform (Windows: Microsoft C++ Build Tools and WebView2, see the [Tauri docs](https://v2.tauri.app/start/prerequisites/))
- `cargo` on `PATH` — on Windows shells that inherit a fresh PATH, add `C:\Users\<you>\.cargo\bin` if it is missing

## Commands

```bash
pnpm install
pnpm tauri dev
pnpm verify
```

- `pnpm install` — install frontend dependencies (`pnpm-workspace.yaml` + `pnpm-lock.yaml`).
- `pnpm tauri dev` — launch the desktop app against `src/` with the Tauri CLI.
- `pnpm verify` — full gate: frontend lint, type-check, test, build, then Rust `fmt --check`, `clippy -D warnings`, and `cargo test`. All steps must exit 0.

## v0.1 Manual Smoke Checklist

Run this on Windows 11 before calling v0.1 complete. The fixture workspace is `tests/fixtures/simple`.

```text
1.  Launch desktop app.
2.  Open tests/fixtures/simple.
3.  Confirm README.md and Notes/hello.md appear.
4.  Confirm ignored.txt does not appear.
5.  Open hello.md.
6.  Edit text.
7.  Save with Ctrl+S.
8.  Open the file in an external text editor and confirm it is ordinary Markdown.
9.  Modify the same file externally while dirty in the app.
10. Try Save and confirm the app refuses silent overwrite.
11. Test CRLF fixture and confirm saving preserves CRLF.
12. Test BOM fixture and confirm saving preserves BOM.
13. Refresh tree after adding/removing a Markdown file externally.
```

## v0.2 Manual Smoke Checklist

Run this on Windows 11 before tagging `v0.2.0-alpha`. The fixture workspace is `tests/fixtures/multi` (two mounts: `notes/` and `wiki/`; each has a top-level note, a nested note, and a `tmp/` note — `tmp` is not in the default exclusions).

```text
1.  Create a new Workspace from two folders: add tests/fixtures/multi/notes, then add tests/fixtures/multi/wiki.
2.  Confirm both mounts appear in the tree (README.md + Projects/project-a.md under notes; index.md + Reference/glossary.md under wiki).
3.  Add a mount, then remove it again; confirm the tree updates immediately.
4.  Set the wiki mount to read-only; confirm ops are disabled in the UI, the mount is marked, and a file operation in Rust is refused (permission denied).
5.  Delete a file from a read-write mount; confirm it is in the OS Recycle Bin (and nothing else happened to it).
6.  Edit exclusions: add `tmp` as a per-mount exclusion for notes; confirm notes/tmp/scratch.md disappears from the tree; clear the override and confirm it returns.
7.  From the UI: create a folder, create a Markdown file, rename a file, and cut/paste-move a file within one mount; confirm all of them against the real files on disk.
8.  Modify a file externally and confirm the tree live-updates (300 ms debounce) without pressing Refresh; also confirm Refresh still works as a forced rescan.
9.  Rename an open document externally; confirm the editor follows it to the new path.
10. Remove a mount that holds a dirty document; confirm the unsaved-changes guard appears and removal waits for your decision.
```

Known gap: switching files and removing mounts refuse to discard an unsaved draft, but there is **no guard for closing the app window while a draft is dirty** — an unsaved edit can be lost on quit. This is tracked for a later milestone. Rename/move does **not** rewrite Markdown links (v0.5).

## Project Layout

```text
src/                  React + TypeScript frontend (Vite)
  app/                App shell and routing
  core/               Cross-cutting concerns (e.g. typed errors)
  features/           Feature slices: editor, files, workspace
  shared/             Shared utilities
  test/               Test setup
src-tauri/            Tauri 2 + Rust backend
  src/commands/       IPC command layer (read/save/scan)
  src/filesystem/     Scanner, reader, writer (atomic save, conflict check)
  src/errors/         Typed error model
docs/
  PROJECT_MASTER_SPEC.md   Long-term product spec and agent manual
  adr/                Architecture decision records
  plans/              Milestone plans
  release-notes/      Release notes per version
tests/fixtures/       Committed byte-level test fixtures (CRLF / BOM / simple tree / multi-mount)
```

## What v0.2 Does Not Include

- No link rewriting on rename/move (renamed files keep content; links pointing at them are not updated — v0.5).
- No cross-mount move, drag & drop, or multi-item selection (move is same-mount only).
- No SQLite / indexing / search (v0.7); Workspace config is versioned JSON in AppData.
- No permanent delete — delete always goes to the OS Recycle Bin.
- No Markdown preview/rendering, tabs, or note Properties panel (still deferred from v0.1).
- No LaTeX support yet, no AI features.
- No app-close unsaved-changes guard (see the known gap above).
