# ADR 0002: Safe Text Save — Normalize in the Editor, Restore on Disk

Date: 2026-08-27

Status: Accepted (v0.1)

## Context

Users edit real Markdown files that exist with varying on-disk representations: LF or CRLF line endings, an optional UTF-8 BOM, arbitrary encodings. The master spec forbids silent reformatting of user files (no silent changes to encoding, line endings, or content) and requires that saves never clobber external modifications or leave files half-written. The editor itself, however, needs one canonical internal text representation to behave predictably.

## Decision

1. **Normalized `\n` inside editor state.** The reader (`src-tauri/src/filesystem/reader.rs`) decodes the file, normalizes all line endings to `\n`, and hands that canonical text to the editor. Decoding is strict UTF-8; a leading UTF-8 BOM (`EF BB BF`) is detected and stripped so it never leaks into editor content; anything not valid UTF-8 is rejected as `UnsupportedEncoding` rather than silently transcoded.

2. **Original newline style and BOM stored in snapshot metadata.** The `TextDocumentSnapshot` returned by `read_markdown_file` records `newline` (`lf` or `crlf`, detected from the raw decode) and `has_utf8_bom`, alongside `modifiedAtMs` and `size` (raw on-disk byte length including the BOM) for later conflict detection.

3. **Save restores original representation.** The frontend builds the save request from the original snapshot's metadata (`src/features/editor/saveDocument.ts`); it never re-detects newline style or BOM from the draft. The writer (`src-tauri/src/filesystem/writer.rs`) re-applies them: `\n` → `\r\n` replacement when the snapshot says CRLF, and BOM bytes prepended when the snapshot says one existed. A file saved without edits is byte-identical to what was read.

4. **External metadata checked before overwrite.** Before writing, the writer compares the file's current mtime and size against the snapshot's expected values. A mismatch means the file changed since it was read; the save fails with `ExternalModificationConflict` and the file is left untouched. The conflict is surfaced to the UI as a typed error so the user decides what to do.

5. **Writes are temporary-file + atomic replacement.** The encoded bytes are written to a uniquely named temp file in the same directory as the target (same volume), flushed and `sync_all`-ed, then moved over the target with a single `fs::rename`. The target file is therefore never observed half-written. On any write/replace failure the temp file is removed and the original stands; a failure-injection unit test proves the original survives a failed replace.

## Alternatives

- Write the editor string directly (overwrite in place): would truncate the file on a mid-write crash and would silently change line endings/BOM; rejected.
- Normalize files on read and keep them normalized on save (reformat on save): violates the no-silent-reformatting rule; rejected.
- Preserve line endings verbatim in editor state: forces the editor to handle mixed endings and makes diff/save logic representation-aware; rejected for v0.1 complexity.
- Hash-based conflict detection (content hash instead of mtime+size): would catch same-size same-mtime edits but requires reading the full file at save time and a hash contract across the boundary; deferred.
- File locking (OS-level locks or lock files): no cross-platform guarantee on user-visible files, and hostile to external editors; rejected for v0.1.

## Consequences

- Round-trip fidelity: LF files stay LF, CRLF files stay CRLF, BOM presence is preserved exactly.
- Conflict safety: stale saves are refused without touching the on-disk file; failed writes never destroy the original.
- Honest v0.1 trade-offs (accepted now, revisited later):
  - Lone `\r` (classic Mac) line endings are normalized to `\n` on read; v0.1 distinguishes only `lf`/`crlf`, so such a file is rewritten in the detected style on save. Same for mixed-ending files: detection is "CRLF if the raw text contains at least one `\r\n`, else LF", and the whole file is rewritten in that one style on save.
  - Conflict detection is mtime+size based. An external change with identical mtime and identical size goes undetected, and there is an inherent TOCTOU window between the metadata check and the rename. Both are noted as inputs to future file-watcher work.
  - If reading the new metadata after a successful rename fails, the save surfaces as an error even though the replace succeeded. Retrying then conflicts against the user's own saved content. Rare; accepted for v0.1.
- Every save pays the cost of a temp file, a flush, an fsync, and a rename; acceptable for note-sized documents.

## Migration

None for v0.1. Future milestones may add a file watcher to narrow the TOCTOU/conflict-detection gaps; the snapshot-metadata contract defined here is the seam that work builds on.
