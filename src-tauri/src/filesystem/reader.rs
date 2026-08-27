use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use crate::errors::AppError;
use crate::filesystem::model::{NewlineStyle, TextDocumentSnapshot};

/// Byte-order mark prefix that marks a UTF-8 file (EF BB BF).
const UTF8_BOM: [u8; 3] = [0xEF, 0xBB, 0xBF];

/// Reads a Markdown file into a snapshot with encoding metadata.
///
/// The file is never rewritten: the snapshot records the on-disk newline
/// style and UTF-8 BOM presence so a later save can restore them, while
/// `content` is normalized to `\n` for the editor. Decoding is strict
/// UTF-8; anything else is rejected as `UnsupportedEncoding`.
pub fn read_text_document(path: &Path) -> Result<TextDocumentSnapshot, AppError> {
    validate_markdown_path(path)?;

    let raw = fs::read(path).map_err(|e| io_error(e, path))?;
    let (decode_bytes, has_utf8_bom) = split_bom(&raw);
    let path_string = display_path(path)?;
    let decoded = std::str::from_utf8(decode_bytes).map_err(|_| AppError::UnsupportedEncoding {
        path: path_string.clone(),
    })?;

    let newline = if decoded.contains("\r\n") {
        NewlineStyle::CrLf
    } else {
        NewlineStyle::Lf
    };
    let content = normalize_newlines(decoded);

    let metadata = fs::metadata(path).map_err(|e| io_error(e, path))?;
    let modified_at_ms = metadata
        .modified()
        .map_err(|e| AppError::Io {
            message: e.to_string(),
        })?
        .duration_since(UNIX_EPOCH)
        .map_err(|e| AppError::Io {
            message: e.to_string(),
        })?
        .as_millis() as u64;

    Ok(TextDocumentSnapshot {
        path: path_string,
        content,
        modified_at_ms,
        // Raw byte length on disk, including the BOM when present; the
        // writer's external-modification check compares against this.
        size: raw.len() as u64,
        newline,
        has_utf8_bom,
    })
}

/// v0.1 only opens `.md` files; this is the command-boundary rule.
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

/// Splits a leading UTF-8 BOM off the raw bytes, if present.
fn split_bom(raw: &[u8]) -> (&[u8], bool) {
    match raw.strip_prefix(&UTF8_BOM) {
        Some(rest) => (rest, true),
        None => (raw, false),
    }
}

/// Rewrites CRLF (and any stray lone CR) line endings to `\n`.
fn normalize_newlines(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
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
    use crate::filesystem::model::NewlineStyle;
    use std::fs;

    fn write_bytes(dir: &Path, name: &str, contents: &[u8]) -> std::path::PathBuf {
        let path = dir.join(name);
        fs::write(&path, contents).expect("test file must be writable");
        path
    }

    #[test]
    fn lf_file_is_detected_as_lf() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let path = write_bytes(dir.path(), "lf.md", b"# Title\nline two\n");

        let snapshot = read_text_document(&path).expect("read must succeed");
        assert_eq!(snapshot.newline, NewlineStyle::Lf);
        assert_eq!(snapshot.content, "# Title\nline two\n");
        assert!(!snapshot.has_utf8_bom);
    }

    #[test]
    fn crlf_file_is_detected_as_crlf() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let path = write_bytes(dir.path(), "crlf.md", b"line one\r\nline two\r\n");

        let snapshot = read_text_document(&path).expect("read must succeed");
        assert_eq!(snapshot.newline, NewlineStyle::CrLf);
        assert_eq!(
            snapshot.content, "line one\nline two\n",
            "editor content must be normalized to LF"
        );
    }

    #[test]
    fn utf8_bom_is_stripped_from_content() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let path = write_bytes(dir.path(), "bom.md", b"\xEF\xBB\xBF# Hello\n");

        let snapshot = read_text_document(&path).expect("read must succeed");
        assert_eq!(
            snapshot.content, "# Hello\n",
            "BOM must not leak into editor-facing content"
        );
        assert!(!snapshot.content.starts_with('\u{FEFF}'));
    }

    #[test]
    fn utf8_bom_flag_is_preserved_in_snapshot() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let raw: &[u8] = b"\xEF\xBB\xBF# Hello\n";
        let path = write_bytes(dir.path(), "bom.md", raw);

        let snapshot = read_text_document(&path).expect("read must succeed");
        assert!(snapshot.has_utf8_bom);
        assert_eq!(
            snapshot.size,
            raw.len() as u64,
            "size must be raw bytes on disk including the BOM"
        );
        assert_eq!(snapshot.newline, NewlineStyle::Lf);
    }

    #[test]
    fn invalid_utf8_returns_unsupported_encoding() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let path = write_bytes(dir.path(), "binary.md", b"\xFF\xFE\x00not utf8");

        let err = read_text_document(&path).expect_err("invalid UTF-8 must fail");
        match err {
            AppError::UnsupportedEncoding { path } => {
                assert!(path.ends_with("binary.md"), "path was {path}");
            }
            other => panic!("expected UnsupportedEncoding, got {other:?}"),
        }
    }

    #[test]
    fn nonexistent_file_returns_file_not_found() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let missing = dir.path().join("missing.md");

        let err = read_text_document(&missing).expect_err("missing file must fail");
        match err {
            AppError::FileNotFound { path } => {
                assert!(path.contains("missing.md"), "path was {path}");
            }
            other => panic!("expected FileNotFound, got {other:?}"),
        }
    }

    #[test]
    fn non_markdown_path_returns_invalid_path() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let path = write_bytes(dir.path(), "notes.txt", b"plain text");

        let err = read_text_document(&path).expect_err("non-markdown must fail");
        match err {
            AppError::InvalidPath { path } => {
                assert!(path.ends_with("notes.txt"), "path was {path}");
            }
            other => panic!("expected InvalidPath, got {other:?}"),
        }
    }
}
