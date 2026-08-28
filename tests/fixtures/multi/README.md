# Multi-Mount Fixture Workspace

This directory is the manual smoke-test workspace for Local Knowledge IDE v0.2.

It is composed of two independent mounts — `notes/` and `wiki/` — so the smoke
test can verify multi-mount behavior without moving any files. Each mount has
the same shape:

- a top-level Markdown file (`notes/README.md`, `wiki/index.md`)
- a nested directory holding a Markdown file (`notes/Projects/project-a.md`,
  `wiki/Reference/glossary.md`)
- a `tmp/` directory holding a Markdown file (`notes/tmp/scratch.md`,
  `wiki/tmp/sandbox.md`)

`tmp/` is intentionally NOT in the default exclusion set. To verify exclusions,
the smoke test adds `tmp` as a per-mount (or workspace-level) exclusion and
confirms both `tmp/` directories disappear from the tree, then clears the
override to confirm they return.

Neither mount is a read-only fixture by default; the smoke test sets one mount
to read-only to verify the permission markers and the Rust-side refusal.
