use std::path::{Path, PathBuf};

use crate::errors::AppError;
use crate::filesystem::model::{
    SaveTextDocumentRequest, SaveTextDocumentResult, TextDocumentSnapshot,
};
use crate::filesystem::ops;
use crate::filesystem::reader::read_text_document;
use crate::filesystem::writer::save_text_document;
use crate::workspace::config::{self, MountConfig};
use crate::workspace::{is_read_write, mount_for_path};

/// Reads a Markdown file into a snapshot with encoding metadata.
///
/// Thin delegation only: all reading logic lives in the reader service.
#[tauri::command]
pub fn read_markdown_file(path: String) -> Result<TextDocumentSnapshot, AppError> {
    read_text_document(Path::new(&path))
}

/// Saves editor content back to the Markdown file atomically.
///
/// Thin delegation only: all writing logic lives in the writer service.
#[tauri::command]
pub fn save_markdown_file(
    request: SaveTextDocumentRequest,
) -> Result<SaveTextDocumentResult, AppError> {
    save_text_document(request)
}

/// Creates a folder under `parent` inside a read-write mount.
#[tauri::command]
pub fn create_folder(
    workspace_id: String,
    parent: String,
    name: String,
    app: tauri::AppHandle,
) -> Result<String, AppError> {
    let mounts = load_mounts(&app, &workspace_id)?;
    require_read_write(&mounts, Path::new(&parent))?;
    let created = ops::create_folder(Path::new(&parent), &name)?;
    Ok(created.to_string_lossy().into_owned())
}

/// Creates an empty Markdown file under `parent` inside a read-write mount.
#[tauri::command]
pub fn create_markdown(
    workspace_id: String,
    parent: String,
    name: String,
    app: tauri::AppHandle,
) -> Result<String, AppError> {
    let mounts = load_mounts(&app, &workspace_id)?;
    require_read_write(&mounts, Path::new(&parent))?;
    let created = ops::create_markdown(Path::new(&parent), &name)?;
    Ok(created.to_string_lossy().into_owned())
}

/// Renames `path` within its directory on a read-write mount.
#[tauri::command]
pub fn rename_path(
    workspace_id: String,
    path: String,
    new_name: String,
    app: tauri::AppHandle,
) -> Result<String, AppError> {
    let mounts = load_mounts(&app, &workspace_id)?;
    require_read_write(&mounts, Path::new(&path))?;
    let renamed = ops::rename_path(Path::new(&path), &new_name)?;
    Ok(renamed.to_string_lossy().into_owned())
}

/// Moves `path` into `target_dir`; both must resolve to the same read-write
/// mount.
#[tauri::command]
pub fn move_path(
    workspace_id: String,
    path: String,
    target_dir: String,
    app: tauri::AppHandle,
) -> Result<String, AppError> {
    let source = Path::new(&path);
    let target = Path::new(&target_dir);
    let mounts = load_mounts(&app, &workspace_id)?;
    let source_mount = require_read_write(&mounts, source)?;
    let target_mount = require_read_write(&mounts, target)?;
    ensure_same_mount(source_mount, target_mount, source)?;
    let moved = ops::move_path(source, target)?;
    Ok(moved.to_string_lossy().into_owned())
}

/// Sends `path` to the OS Trash; only allowed on a read-write mount.
#[tauri::command]
pub fn delete_to_trash(
    workspace_id: String,
    path: String,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    let mounts = load_mounts(&app, &workspace_id)?;
    require_read_write(&mounts, Path::new(&path))?;
    ops::delete_to_trash(Path::new(&path))
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let base = dirs::data_dir().ok_or_else(|| AppError::Io {
        message: "no app data dir".into(),
    })?;
    Ok(base.join(app.config().identifier.as_str()))
}

fn load_mounts(app: &tauri::AppHandle, workspace_id: &str) -> Result<Vec<MountConfig>, AppError> {
    let dir = app_data_dir(app)?;
    config::load_workspace(&dir, workspace_id).map(|cfg| cfg.mounts)
}

fn permission_denied(path: &Path) -> AppError {
    AppError::PermissionDenied {
        path: path.to_string_lossy().into_owned(),
    }
}

/// Resolves the mount covering `path` and requires it to be read-write.
fn require_read_write<'a>(
    mounts: &'a [MountConfig],
    path: &Path,
) -> Result<&'a MountConfig, AppError> {
    let mount = mount_for_path(mounts, path).ok_or_else(|| permission_denied(path))?;
    if !is_read_write(mount) {
        return Err(permission_denied(path));
    }
    Ok(mount)
}

/// Rejects a move whose source and target resolve to different mount entries.
fn ensure_same_mount<'a>(
    source: &'a MountConfig,
    target: &'a MountConfig,
    source_path: &Path,
) -> Result<(), AppError> {
    if std::ptr::eq(source, target) {
        Ok(())
    } else {
        Err(AppError::CrossMountMoveNotAllowed {
            path: source_path.to_string_lossy().into_owned(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace::config::MountPermission;

    fn mount(path: &str, permission: MountPermission) -> MountConfig {
        MountConfig {
            path: path.to_string(),
            permission,
            exclusions: None,
        }
    }

    #[test]
    fn require_read_write_allows_read_write_mounts() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Notes");
        std::fs::create_dir_all(&root).unwrap();
        let file = root.join("note.md");
        std::fs::write(&file, b"x").unwrap();
        let mounts = vec![mount(&root.to_string_lossy(), MountPermission::ReadWrite)];
        assert!(require_read_write(&mounts, &file).is_ok());
    }

    #[test]
    fn require_read_write_denies_read_only_excluded_and_unmounted_paths() {
        let tmp = tempfile::tempdir().unwrap();
        let ro = tmp.path().join("RO");
        let excluded = tmp.path().join("EX");
        std::fs::create_dir_all(&ro).unwrap();
        std::fs::create_dir_all(&excluded).unwrap();
        let ro_file = ro.join("note.md");
        std::fs::write(&ro_file, b"x").unwrap();
        let excluded_file = excluded.join("note.md");
        std::fs::write(&excluded_file, b"x").unwrap();
        let outside = tmp.path().join("outside.md");
        std::fs::write(&outside, b"x").unwrap();

        let mounts = vec![
            mount(&ro.to_string_lossy(), MountPermission::ReadOnly),
            mount(&excluded.to_string_lossy(), MountPermission::Excluded),
        ];
        for path in [&ro_file, &excluded_file, &outside] {
            match require_read_write(&mounts, path) {
                Err(AppError::PermissionDenied { .. }) => {}
                other => panic!("expected PermissionDenied for {path:?}, got {other:?}"),
            }
        }
    }

    #[test]
    fn ensure_same_mount_allows_same_entry_and_rejects_cross_mount() {
        let a = mount("A", MountPermission::ReadWrite);
        let b = mount("B", MountPermission::ReadWrite);
        assert!(ensure_same_mount(&a, &a, Path::new("A/x.md")).is_ok());

        let err = ensure_same_mount(&a, &b, Path::new("A/x.md")).unwrap_err();
        match err {
            AppError::CrossMountMoveNotAllowed { path } => assert_eq!(path, "A/x.md"),
            other => panic!("expected CrossMountMoveNotAllowed, got {other:?}"),
        }
    }
}
