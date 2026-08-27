# Local Knowledge IDE

A local-first, open-format personal knowledge workbench. Local Knowledge IDE edits real local Markdown files; there is no proprietary storage, no vendor lock-in, and no silent data loss.

v0.1 is the foundation milestone: pick one local directory, browse its Markdown files, and edit them in a CodeMirror source editor with safe, atomic saves. Your notes stay ordinary `.md` files on disk — uninstalling the app leaves them exactly as they are.

> Status: **v0.1.0-alpha**. See `docs/release-notes/v0.1.0-alpha.md` for what is supported and explicitly deferred.

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

Known gap: switching files refuses to discard an unsaved draft, but there is **no guard for closing the app window while a draft is dirty** — an unsaved edit can be lost on quit. This is tracked for a later milestone.

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
tests/fixtures/       Committed byte-level test fixtures (CRLF / BOM / simple tree)
```

## What v0.1 Does Not Include

- No file watcher — the tree updates only on explicit **Refresh**.
- No multi-folder Workspace — exactly one root directory at a time.
- No Markdown preview/rendering, tabs, or note Properties panel.
- No indexing, search, graph, or database.
- No LaTeX support yet.
- No AI features.
- No app-close unsaved-changes guard (see the known gap above).
