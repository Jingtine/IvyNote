use std::path::{Path, PathBuf};

use crate::errors::AppError;
use crate::filesystem::model::FileTreeNode;
use crate::filesystem::scanner::scan_markdown_tree;
use crate::workspace::config::{self, WorkspaceConfig};
use crate::workspace::recent;

/// Scans a workspace root directory for its Markdown file tree.
///
/// Thin delegation only: all scanning logic lives in the scanner service.
/// When `exclusions` is `None`, the workspace defaults are used.
#[tauri::command]
pub fn scan_root(
    root: String,
    exclusions: Option<Vec<String>>,
) -> Result<Vec<FileTreeNode>, AppError> {
    let exclusions = exclusions.unwrap_or_else(config::default_exclusions);
    scan_markdown_tree(Path::new(&root), &exclusions)
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let base = dirs::data_dir().ok_or_else(|| AppError::Io {
        message: "no app data dir".into(),
    })?;
    Ok(base.join(app.config().identifier.as_str()))
}

#[tauri::command]
pub fn create_workspace(name: String, app: tauri::AppHandle) -> Result<WorkspaceConfig, AppError> {
    config::create_workspace(&app_data_dir(&app)?, &name)
}

#[tauri::command]
pub fn list_workspaces(app: tauri::AppHandle) -> Result<Vec<WorkspaceConfig>, AppError> {
    config::list_workspaces(&app_data_dir(&app)?)
}

#[tauri::command]
pub fn list_recent_workspaces(app: tauri::AppHandle) -> Result<Vec<String>, AppError> {
    recent::load_recent(&app_data_dir(&app)?)
}

#[tauri::command]
pub fn open_workspace(id: String, app: tauri::AppHandle) -> Result<WorkspaceConfig, AppError> {
    let dir = app_data_dir(&app)?;
    let config = config::load_workspace(&dir, &id)?;
    recent::push_recent(&dir, &id)?;
    Ok(config)
}
