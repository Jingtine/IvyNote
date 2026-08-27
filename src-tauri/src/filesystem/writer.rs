use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::errors::AppError;
use crate::filesystem::model::{NewlineStyle, SaveTextDocumentRequest, SaveTextDocumentResult};

/// Byte-order mark prefix that marks a UTF-8 file (EF BB BF).
const UTF8_BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

/// Saves a Markdown file atomically, refusing to overwrite external changes.
///
/// The editor text is LF-normalized; the request carries the original
/// snapshot's newline style and BOM flag so the on-disk representation is
/// restored instead of re-detected. Before writing, the file's current
/// metadata is compared against the expected mtime and size; a mismatch
/// means someone else changed the file and the save is rejected without
/// touching it. The new content is written to a temp file in the same
/// directory, flushed and synced, then moved over the target in one
/// rename so the file is never observed half-written.
pub fn save_text_document(
    request: SaveTextDocumentRequest,
) -> Result<SaveTextDocumentResult, AppError> {
    save_with_replacer(&request, |from, to| fs::rename(from, to))
}

/// Save core with an injectable final-replace step so tests can prove a
/// failed replacement leaves the original untouched.
fn save_with_replacer(
    request: &SaveTextDocumentRequest,
    replace: impl FnOnce(&Path, &Path) -> std::io::Result<()>,
) -> Result<SaveTextDocumentResult, AppError> {
    let path = Path::new(&request.path);
    validate_markdown_path(path)?;

    let metadata = fs::metadata(path).map_err(|e| io_error(e, path))?;
    let current_modified_at_ms = modified_at_ms(&metadata)?;
    if current_modified_at_ms != request.expected_modified_at_ms
        || metadata.len() != request.expected_size
    {
        return Err(AppError::ExternalModificationConflict {
            path: display_path(path)?,
        });
    }

    let bytes = encode(&request.content, request.newline, request.has_utf8_bom);
    let temp_path = temp_path_for(path)?;

    if let Err(e) = write_temp_file(&temp_path, &bytes).and_then(|()| replace(&temp_path, path)) {
        let _ = fs::remove_file(&temp_path);
        return Err(AppError::Io {
            message: e.to_string(),
        });
    }

    let new_metadata = fs::metadata(path).map_err(|e| io_error(e, path))?;
    Ok(SaveTextDocumentResult {
        modified_at_ms: modified_at_ms(&new_metadata)?,
        size: new_metadata.len(),
    })
}

/// v0.1 only saves `.md` files; this is the command-boundary rule.
fn validate_markdown_path(path: &Path) -> Result<(), AppError> {
    let is_markdown = path
        .extension()
        .is_some_and(|ext| ext.to_string_lossy().eq_ignore_ascii_case("md"));
    if is_markdown {
        Ok(())
    } else {
        Err(AppError::InvalidPath {
            path: display_path(path)?,
        })
    }
}

/// Re-applies the stored newline style and UTF-8 BOM to LF-normalized
/// editor text, producing the exact bytes to write.
fn encode(content: &str, newline: NewlineStyle, has_utf8_bom: bool) -> Vec<u8> {
    let text = match newline {
        NewlineStyle::Lf => content.to_string(),
        NewlineStyle::CrLf => content.replace('\n', "\r\n"),
    };
    let mut bytes = Vec::with_capacity(text.len() + UTF8_BOM.len());
    if has_utf8_bom {
        bytes.extend_from_slice(&UTF8_BOM);
    }
    bytes.extend_from_slice(text.as_bytes());
    bytes
}

/// Unique temp-file path next to the target so the final rename stays
/// within the same directory (same volume) and remains atomic.
fn temp_path_for(path: &Path) -> Result<PathBuf, AppError> {
    let file_name = path.file_name().and_then(|name| name.to_str());
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| AppError::Io {
            message: e.to_string(),
        })?
        .as_nanos();
    match file_name {
        Some(name) => Ok(path.with_file_name(format!("{name}.ivynote-tmp-{nanos}"))),
        None => Err(AppError::InvalidPath {
            path: display_path(path)?,
        }),
    }
}

/// Writes all bytes, flushes, and syncs the temp file to disk.
fn write_temp_file(temp: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = File::create(temp)?;
    file.write_all(bytes)?;
    file.flush()?;
    file.sync_all()
}

fn modified_at_ms(metadata: &fs::Metadata) -> Result<u64, AppError> {
    metadata
        .modified()
        .map_err(|e| AppError::Io {
            message: e.to_string(),
        })?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| AppError::Io {
            message: e.to_string(),
        })
        .map(|d| d.as_millis() as u64)
}

fn io_error(e: std::io::Error, path: &Path) -> AppError {
    match e.kind() {
        std::io::ErrorKind::NotFound => AppError::FileNotFound {
            path: display_path(path).unwrap_or_else(|_| path.to_string_lossy().into_owned()),
        },
        std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied {
            path: display_path(path).unwrap_or_else(|_| path.to_string_lossy().into_owned()),
        },
        _ => AppError::Io {
            message: e.to_string(),
        },
    }
}

/// Converts a path to a string, rejecting non-UTF-8 paths as invalid.
fn display_path(path: &Path) -> Result<String, AppError> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| AppError::InvalidPath {
            path: path.to_string_lossy().into_owned(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filesystem::model::{NewlineStyle, TextDocumentSnapshot};
    use crate::filesystem::reader::read_text_document;
    use std::fs;

    fn write_bytes(dir: &Path, name: &str, contents: &[u8]) -> std::path::PathBuf {
        let path = dir.join(name);
        fs::write(&path, contents).expect("test file must be writable");
        path
    }

    fn save_request(snapshot: &TextDocumentSnapshot, content: &str) -> SaveTextDocumentRequest {
        SaveTextDocumentRequest {
            path: snapshot.path.clone(),
            content: content.to_string(),
            expected_modified_at_ms: snapshot.modified_at_ms,
            expected_size: snapshot.size,
            newline: snapshot.newline,
            has_utf8_bom: snapshot.has_utf8_bom,
        }
    }

    #[test]
    fn preserves_lf_line_endings_on_save() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let path = write_bytes(dir.path(), "lf.md", b"# Title\nline two\n");
        let snapshot = read_text_document(&path).expect("read must succeed");

        save_text_document(save_request(&snapshot, "# Title\nline two edited\n"))
            .expect("save must succeed");

        let raw = fs::read(&path).expect("saved file must be readable");
        assert_eq!(raw, b"# Title\nline two edited\n");
        assert!(
            !raw.windows(2).any(|w| w == b"\r\n"),
            "raw file must not contain CRLF"
        );
    }

    #[test]
    fn preserves_crlf_line_endings_on_save() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let path = write_bytes(dir.path(), "crlf.md", b"# Title\r\nline two\r\n");
        let snapshot = read_text_document(&path).expect("read must succeed");
        assert_eq!(snapshot.newline, NewlineStyle::CrLf);

        let result = save_text_document(save_request(&snapshot, "# Title\nline two edited\n"))
            .expect("save must succeed");

        let raw = fs::read(&path).expect("saved file must be readable");
        assert_eq!(raw, b"# Title\r\nline two edited\r\n");
        for (index, &byte) in raw.iter().enumerate() {
            if byte == b'\n' {
                assert!(
                    index > 0 && raw[index - 1] == b'\r',
                    "every LF must be part of CRLF"
                );
            }
        }
        assert_eq!(result.size, raw.len() as u64);
        assert!(result.modified_at_ms >= snapshot.modified_at_ms);
    }

    #[test]
    fn restores_utf8_bom_on_save() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let path = write_bytes(dir.path(), "bom.md", b"\xEF\xBB\xBF# Hello\n");
        let snapshot = read_text_document(&path).expect("read must succeed");
        assert!(snapshot.has_utf8_bom);

        save_text_document(save_request(&snapshot, "# Hello edited\n")).expect("save must succeed");

        let raw = fs::read(&path).expect("saved file must be readable");
        assert_eq!(
            &raw[..3],
            &[0xEF, 0xBB, 0xBF],
            "saved raw file must begin with the UTF-8 BOM"
        );
        assert_eq!(&raw[3..], b"# Hello edited\n");
    }

    #[test]
    fn does_not_create_bom_when_none_existed() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let path = write_bytes(dir.path(), "plain.md", b"# Hello\n");
        let snapshot = read_text_document(&path).expect("read must succeed");
        assert!(!snapshot.has_utf8_bom);

        save_text_document(save_request(&snapshot, "# Hello edited\n")).expect("save must succeed");

        let raw = fs::read(&path).expect("saved file must be readable");
        assert!(
            !raw.starts_with(&[0xEF, 0xBB, 0xBF]),
            "saved raw file must not gain a BOM"
        );
        assert_eq!(raw, b"# Hello edited\n");
    }

    #[test]
    fn detects_external_modification_and_leaves_file_untouched() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let path = write_bytes(dir.path(), "conflict.md", b"# Original\n");
        let snapshot = read_text_document(&path).expect("read must succeed");

        let external = b"# Changed externally with different length\n";
        fs::write(&path, external).expect("external write must succeed");

        let err = save_text_document(save_request(&snapshot, "# My edit\n"))
            .expect_err("save over externally modified file must fail");
        match err {
            AppError::ExternalModificationConflict { path } => {
                assert!(path.ends_with("conflict.md"), "path was {path}");
            }
            other => panic!("expected ExternalModificationConflict, got {other:?}"),
        }

        assert_eq!(
            fs::read(&path).expect("file must remain readable"),
            external,
            "external content must remain untouched"
        );
    }

    #[test]
    fn failed_replacement_protects_original_and_cleans_temp() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let path = write_bytes(dir.path(), "protected.md", b"# Original\n");
        let snapshot = read_text_document(&path).expect("read must succeed");
        let request = save_request(&snapshot, "# Edited\n");

        let err = save_with_replacer(&request, |_from, _to| {
            Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "simulated replace failure",
            ))
        })
        .expect_err("injected replace failure must fail the save");
        match err {
            AppError::Io { message } => {
                assert!(message.contains("simulated replace failure"));
            }
            other => panic!("expected Io, got {other:?}"),
        }

        assert_eq!(
            fs::read(&path).expect("original must remain readable"),
            b"# Original\n",
            "original file must be unchanged"
        );
        let reread = read_text_document(&path).expect("original must still parse");
        assert_eq!(reread.content, "# Original\n");

        let leftovers: Vec<String> = fs::read_dir(dir.path())
            .expect("dir must be listable")
            .filter_map(|entry| {
                let name = entry.expect("entry must be readable").file_name();
                Some(name.to_string_lossy().into_owned())
            })
            .filter(|name| name.contains(".ivynote-tmp-"))
            .collect();
        assert!(
            leftovers.is_empty(),
            "temp files must be cleaned up, found {leftovers:?}"
        );
    }

    #[test]
    fn rejects_non_markdown_save_path() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let path = write_bytes(dir.path(), "notes.txt", b"plain text");

        let request = SaveTextDocumentRequest {
            path: path.to_string_lossy().into_owned(),
            content: "edited".to_string(),
            expected_modified_at_ms: 0,
            expected_size: 0,
            newline: NewlineStyle::Lf,
            has_utf8_bom: false,
        };
        let err = save_text_document(request).expect_err("non-markdown save must fail");
        match err {
            AppError::InvalidPath { path } => {
                assert!(path.ends_with("notes.txt"), "path was {path}");
            }
            other => panic!("expected InvalidPath, got {other:?}"),
        }
    }
}
