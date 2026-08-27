use std::fs;
use std::path::{Path, PathBuf};

use crate::errors::AppError;

/// Creates a folder named `name` inside `parent`.
pub fn create_folder(parent: &Path, name: &str) -> Result<PathBuf, AppError> {
    validate_name(name)?;
    let path = parent.join(name);
    fs::create_dir(&path).map_err(|e| io_error(e, &path))?;
    Ok(path)
}

/// Creates an empty Markdown file named `name` inside `parent`.
pub fn create_markdown(parent: &Path, name: &str) -> Result<PathBuf, AppError> {
    validate_name(name)?;
    if !is_markdown_name(name) {
        return Err(AppError::InvalidPath {
            path: name.to_string(),
        });
    }
    let path = parent.join(name);
    fs::write(&path, b"").map_err(|e| io_error(e, &path))?;
    Ok(path)
}

/// Renames `path` to `new_name` within the same directory.
///
/// A Markdown source must keep a `.md` name so the file type is preserved;
/// folders and non-Markdown items may be renamed to any valid name.
pub fn rename_path(path: &Path, new_name: &str) -> Result<PathBuf, AppError> {
    validate_name(new_name)?;
    if is_markdown_path(path) && !is_markdown_name(new_name) {
        return Err(AppError::InvalidPath {
            path: new_name.to_string(),
        });
    }
    let current =
        path.file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| AppError::InvalidPath {
                path: path.to_string_lossy().into_owned(),
            })?;
    let target = path.with_file_name(new_name);
    if current == new_name {
        return Ok(target);
    }
    fs::rename(path, &target).map_err(|e| io_error(e, &target))?;
    Ok(target)
}

/// Moves `path` into `target_dir` with the same file name.
///
/// Moving into the source directory itself is rejected, and an existing
/// target is never overwritten silently.
pub fn move_path(path: &Path, target_dir: &Path) -> Result<PathBuf, AppError> {
    let file_name = path.file_name().ok_or_else(|| AppError::InvalidPath {
        path: path.to_string_lossy().into_owned(),
    })?;
    if same_directory(path.parent().unwrap_or_else(|| Path::new("")), target_dir) {
        return Err(AppError::InvalidPath {
            path: path.to_string_lossy().into_owned(),
        });
    }
    let target = target_dir.join(file_name);
    if target.exists() {
        return Err(AppError::Io {
            message: format!("target already exists: {}", target.to_string_lossy()),
        });
    }
    fs::rename(path, &target).map_err(|e| io_error(e, &target))?;
    Ok(target)
}

/// Abstraction over the system Trash so tests never touch the real Recycle
/// Bin (the delete boundary is mockable per spec §32.2).
pub trait Trash {
    fn delete(&self, path: &Path) -> std::io::Result<()>;
}

pub struct SystemTrash;

impl Trash for SystemTrash {
    fn delete(&self, path: &Path) -> std::io::Result<()> {
        trash::delete(path).map_err(|e| std::io::Error::other(e.to_string()))
    }
}

/// Sends `path` to the OS Trash / Recycle Bin.
pub fn delete_to_trash(path: &Path) -> Result<(), AppError> {
    delete_to_trash_with(&SystemTrash, path)
}

fn delete_to_trash_with<T: Trash>(trash: &T, path: &Path) -> Result<(), AppError> {
    trash.delete(path).map_err(|e| io_error(e, path))?;
    Ok(())
}

/// True when `path` has a `.md` extension (case-insensitive).
pub fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.to_string_lossy().eq_ignore_ascii_case("md"))
}

fn is_markdown_name(name: &str) -> bool {
    is_markdown_path(Path::new(name))
}

/// Name validation shared by create/rename: non-empty, no path separators,
/// and not `.` or `..`.
fn validate_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err(AppError::InvalidPath {
            path: name.to_string(),
        });
    }
    Ok(())
}

/// True when both paths resolve to the same directory; compares canonical
/// paths so relative/absolute and Windows case differences resolve, falling
/// back to the lexical comparison when canonicalization fails.
fn same_directory(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(ca), Ok(cb)) => ca == cb,
        _ => a == b,
    }
}

fn io_error(e: std::io::Error, path: &Path) -> AppError {
    match e.kind() {
        std::io::ErrorKind::NotFound => AppError::FileNotFound {
            path: path.to_string_lossy().into_owned(),
        },
        std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied {
            path: path.to_string_lossy().into_owned(),
        },
        _ => AppError::Io {
            message: e.to_string(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::sync::{Arc, Mutex};

    fn touch(dir: &Path, name: &str) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, b"content").expect("test file must be writable");
        path
    }

    fn assert_invalid_path(result: Result<PathBuf, AppError>) {
        match result {
            Err(AppError::InvalidPath { .. }) => {}
            other => panic!("expected InvalidPath, got {other:?}"),
        }
    }

    #[derive(Default)]
    struct MockTrash {
        deleted: Arc<Mutex<Vec<PathBuf>>>,
        fail: bool,
    }

    impl Trash for MockTrash {
        fn delete(&self, path: &Path) -> std::io::Result<()> {
            if self.fail {
                return Err(std::io::Error::other("mock trash failure"));
            }
            self.deleted.lock().unwrap().push(path.to_path_buf());
            Ok(())
        }
    }

    #[test]
    fn create_folder_creates_directory_and_returns_its_path() {
        let dir = tempfile::tempdir().unwrap();
        let created = create_folder(dir.path(), "new folder").unwrap();
        assert_eq!(created, dir.path().join("new folder"));
        assert!(created.is_dir());
    }

    #[test]
    fn create_folder_rejects_empty_name() {
        let dir = tempfile::tempdir().unwrap();
        assert_invalid_path(create_folder(dir.path(), ""));
    }

    #[test]
    fn create_folder_rejects_dot_dot_name() {
        let dir = tempfile::tempdir().unwrap();
        assert_invalid_path(create_folder(dir.path(), ".."));
    }

    #[test]
    fn create_folder_rejects_names_with_separators() {
        let dir = tempfile::tempdir().unwrap();
        assert_invalid_path(create_folder(dir.path(), "a/b"));
        assert_invalid_path(create_folder(dir.path(), "a\\b"));
    }

    #[test]
    fn create_markdown_creates_empty_markdown_file() {
        let dir = tempfile::tempdir().unwrap();
        let created = create_markdown(dir.path(), "note.md").unwrap();
        assert_eq!(created, dir.path().join("note.md"));
        assert!(created.is_file());
        assert_eq!(fs::read(&created).unwrap(), b"");
        assert!(is_markdown_path(&created));
    }

    #[test]
    fn create_markdown_rejects_non_md_names() {
        let dir = tempfile::tempdir().unwrap();
        assert_invalid_path(create_markdown(dir.path(), "note.txt"));
        assert_invalid_path(create_markdown(dir.path(), "note"));
    }

    #[test]
    fn rename_path_renames_within_same_dir_and_old_path_is_gone() {
        let dir = tempfile::tempdir().unwrap();
        let original = touch(dir.path(), "old.md");
        let renamed = rename_path(&original, "new.md").unwrap();
        assert_eq!(renamed, dir.path().join("new.md"));
        assert!(renamed.is_file());
        assert!(!original.exists(), "old path must not exist after rename");
    }

    #[test]
    fn rename_path_rejects_dropping_markdown_extension() {
        let dir = tempfile::tempdir().unwrap();
        let original = touch(dir.path(), "old.md");
        assert_invalid_path(rename_path(&original, "new"));
        assert!(original.exists(), "original must be untouched on failure");
    }

    #[test]
    fn rename_path_renames_folder_without_extension_requirement() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("old folder");
        fs::create_dir(&folder).unwrap();
        let renamed = rename_path(&folder, "new folder").unwrap();
        assert_eq!(renamed, dir.path().join("new folder"));
        assert!(renamed.is_dir());
        assert!(!folder.exists(), "old folder must not exist after rename");
    }

    #[test]
    fn rename_path_rejects_empty_new_name() {
        let dir = tempfile::tempdir().unwrap();
        let original = touch(dir.path(), "old.md");
        assert_invalid_path(rename_path(&original, ""));
        assert!(original.exists());
    }

    #[test]
    fn move_path_moves_file_into_target_dir() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        let original = touch(dir.path(), "note.md");
        let moved = move_path(&original, &sub).unwrap();
        assert_eq!(moved, sub.join("note.md"));
        assert!(moved.is_file());
        assert!(!original.exists(), "source must not exist after move");
    }

    #[test]
    fn move_path_rejects_moving_into_same_directory() {
        let dir = tempfile::tempdir().unwrap();
        let original = touch(dir.path(), "note.md");
        assert_invalid_path(move_path(&original, dir.path()));
    }

    #[test]
    fn move_path_rejects_overwriting_existing_target() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("sub");
        fs::create_dir(&sub).unwrap();
        let original = touch(dir.path(), "note.md");
        touch(&sub, "note.md");

        let err = move_path(&original, &sub).unwrap_err();
        match err {
            AppError::Io { .. } => {}
            other => panic!("expected Io, got {other:?}"),
        }
        assert!(original.exists(), "source must be untouched on failure");
    }

    #[test]
    fn delete_to_trash_records_path_with_mock() {
        let trash = MockTrash::default();
        let path = Path::new("C:\\notes\\stale.md");
        delete_to_trash_with(&trash, path).unwrap();
        assert_eq!(*trash.deleted.lock().unwrap(), vec![path.to_path_buf()]);
    }

    #[test]
    fn delete_to_trash_propagates_mock_error() {
        let trash = MockTrash {
            fail: true,
            ..Default::default()
        };
        let err = delete_to_trash_with(&trash, Path::new("C:\\notes\\x.md")).unwrap_err();
        match err {
            AppError::Io { message } => assert!(message.contains("mock trash failure")),
            other => panic!("expected Io, got {other:?}"),
        }
    }

    #[test]
    fn delete_to_trash_moves_real_file_when_env_enabled() {
        if std::env::var("IVY_TRASH_TEST").map_or(false, |v| v == "1") {
            let dir = tempfile::tempdir().unwrap();
            let path = touch(dir.path(), "trash-me.md");
            delete_to_trash(&path).unwrap();
            assert!(!path.exists(), "file must be gone after trashing");
        }
    }

    #[test]
    fn is_markdown_path_true_for_md_and_md() {
        assert!(is_markdown_path(Path::new("a.md")));
        assert!(is_markdown_path(Path::new("A.MD")));
        assert!(is_markdown_path(Path::new("dir/note.Md")));
    }

    #[test]
    fn is_markdown_path_false_for_other_extensions_and_extensionless() {
        assert!(!is_markdown_path(Path::new("a.txt")));
        assert!(!is_markdown_path(Path::new("a.md.txt")));
        assert!(!is_markdown_path(Path::new("folder")));
        assert!(!is_markdown_path(Path::new("")));
    }
}
