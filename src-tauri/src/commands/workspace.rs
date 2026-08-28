use std::path::{Path, PathBuf};

use crate::errors::AppError;
use crate::filesystem::model::FileTreeNode;
use crate::filesystem::scanner::scan_markdown_tree;
use crate::workspace::config::{self, MountPermission, WorkspaceConfig};
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

/// Updates the exclusions override for a single mount and persists it.
///
/// Thin delegation only: all config logic lives in the workspace config
/// service. Returns the updated config so the frontend can rescan with the
/// new effective exclusions.
#[tauri::command]
pub fn update_mount_exclusions(
    workspace_id: String,
    path: String,
    exclusions: Vec<String>,
    app: tauri::AppHandle,
) -> Result<WorkspaceConfig, AppError> {
    config::update_mount_exclusions(&app_data_dir(&app)?, &workspace_id, &path, &exclusions)
}

/// Appends a new mount to the workspace and persists it.
///
/// Thin delegation only: all config logic lives in the workspace config
/// service. Returns the updated config so the frontend can rescan the new
/// mount and re-sync its watchers with the persisted state.
#[tauri::command]
pub fn add_mount(
    workspace_id: String,
    path: String,
    permission: MountPermission,
    app: tauri::AppHandle,
) -> Result<WorkspaceConfig, AppError> {
    config::add_mount(&app_data_dir(&app)?, &workspace_id, &path, permission)
}

/// Removes a mount from the workspace and persists it.
///
/// Thin delegation only. Returns the updated config so the frontend can drop
/// the removed mount's tree and re-sync its watchers.
#[tauri::command]
pub fn remove_mount(
    workspace_id: String,
    path: String,
    app: tauri::AppHandle,
) -> Result<WorkspaceConfig, AppError> {
    config::remove_mount(&app_data_dir(&app)?, &workspace_id, &path)
}

/// Updates a mount's permission and persists it.
///
/// Thin delegation only. Returns the updated config so the frontend can adopt
/// the persisted permission without rescansing.
#[tauri::command]
pub fn set_mount_permission(
    workspace_id: String,
    path: String,
    permission: MountPermission,
    app: tauri::AppHandle,
) -> Result<WorkspaceConfig, AppError> {
    config::set_mount_permission(&app_data_dir(&app)?, &workspace_id, &path, permission)
}

/// Updates the workspace-level default exclusions and persists them.
///
/// Thin delegation only: all config logic lives in the workspace config
/// service. Returns the updated config so the frontend can rescan all mounts.
#[tauri::command]
pub fn update_workspace_exclusions(
    workspace_id: String,
    exclusions: Vec<String>,
    app: tauri::AppHandle,
) -> Result<WorkspaceConfig, AppError> {
    config::update_workspace_exclusions(&app_data_dir(&app)?, &workspace_id, &exclusions)
}

/// Starts a per-mount file watcher for every readable mount of the workspace.
///
/// Excluded mounts are skipped; each watched mount uses its effective
/// exclusions (mount override, else workspace default, else built-in).
#[tauri::command]
pub fn watch_workspace(workspace_id: String, app: tauri::AppHandle) -> Result<(), AppError> {
    let config = config::load_workspace(&app_data_dir(&app)?, &workspace_id)?;
    let mounts: Vec<(String, Vec<String>)> = config
        .mounts
        .iter()
        .filter(|mount| {
            matches!(
                mount.permission,
                config::MountPermission::ReadWrite | config::MountPermission::ReadOnly
            )
        })
        .map(|mount| {
            (
                mount.path.clone(),
                config::effective_exclusions(&config, mount),
            )
        })
        .collect();
    crate::watcher::start_watching(&app, &mounts)
}

/// Stops all active file watchers.
#[tauri::command]
pub fn stop_watching_cmd(app: tauri::AppHandle) -> Result<(), AppError> {
    crate::watcher::stop_watching(&app)
}
