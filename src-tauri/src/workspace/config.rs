use std::fs;
use std::path::{Path, PathBuf};

use crate::errors::AppError;
use serde::{Deserialize, Serialize};

pub const DEFAULT_EXCLUSIONS: [&str; 9] = [
    ".git",
    "node_modules",
    "dist",
    "build",
    "target",
    ".venv",
    "venv",
    ".cache",
    "coverage",
];

pub const WORKSPACE_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfig {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub mounts: Vec<MountConfig>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub exclusions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MountConfig {
    pub path: String,
    pub permission: MountPermission,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exclusions: Option<Vec<String>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MountPermission {
    ReadWrite,
    ReadOnly,
    Excluded,
}

pub fn default_exclusions() -> Vec<String> {
    DEFAULT_EXCLUSIONS.iter().map(|s| s.to_string()).collect()
}

fn app_workspace_root(app_data_dir: &Path) -> Result<PathBuf, AppError> {
    Ok(app_data_dir.join("workspaces"))
}

pub fn workspace_dir(app_data_dir: &Path) -> Result<PathBuf, AppError> {
    let dir = app_workspace_root(app_data_dir)?;
    fs::create_dir_all(&dir).map_err(|e| io_error(e, &dir))?;
    Ok(dir)
}

pub fn workspace_file_path(app_data_dir: &Path, id: &str) -> Result<PathBuf, AppError> {
    Ok(workspace_dir(app_data_dir)?.join(format!("{id}.json")))
}

pub fn load_workspace(app_data_dir: &Path, id: &str) -> Result<WorkspaceConfig, AppError> {
    let path = workspace_file_path(app_data_dir, id)?;
    let bytes = match fs::read(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::WorkspaceNotFound { id: id.to_string() });
        }
        Err(e) => return Err(io_error(e, &path)),
    };
    let config: WorkspaceConfig = serde_json::from_slice(&bytes)
        .map_err(|_| AppError::InvalidWorkspaceConfig { id: id.to_string() })?;
    if config.schema_version != WORKSPACE_SCHEMA_VERSION {
        return Err(AppError::InvalidWorkspaceConfig { id: id.to_string() });
    }
    Ok(config)
}

pub fn save_workspace(app_data_dir: &Path, config: &WorkspaceConfig) -> Result<(), AppError> {
    let dir = workspace_dir(app_data_dir)?;
    let final_path = dir.join(format!("{}.json", config.id));
    let bytes = serde_json::to_vec_pretty(config).map_err(|e| AppError::Io {
        message: e.to_string(),
    })?;
    let tmp_path = dir.join(format!("{}.tmp-{}", config.id, std::process::id()));
    fs::write(&tmp_path, &bytes).map_err(|e| io_error(e, &tmp_path))?;
    // Reuse the atomic replace semantics verified in v0.1's writer.
    fs::rename(&tmp_path, &final_path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        io_error(e, &final_path)
    })?;
    Ok(())
}

pub fn create_workspace(app_data_dir: &Path, name: &str) -> Result<WorkspaceConfig, AppError> {
    let config = WorkspaceConfig {
        schema_version: WORKSPACE_SCHEMA_VERSION,
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        mounts: Vec::new(),
        exclusions: default_exclusions(),
    };
    save_workspace(app_data_dir, &config)?;
    Ok(config)
}

pub fn effective_exclusions(config: &WorkspaceConfig, mount: &MountConfig) -> Vec<String> {
    mount.exclusions.clone().unwrap_or_else(|| {
        if config.exclusions.is_empty() {
            default_exclusions()
        } else {
            config.exclusions.clone()
        }
    })
}

pub fn update_mount_exclusions(
    app_data_dir: &Path,
    workspace_id: &str,
    path: &str,
    exclusions: &[String],
) -> Result<WorkspaceConfig, AppError> {
    let mut config = load_workspace(app_data_dir, workspace_id)?;
    let mount = config
        .mounts
        .iter_mut()
        .find(|mount| mount.path == path)
        .ok_or_else(|| AppError::MountNotFound {
            workspace_id: workspace_id.to_string(),
            path: path.to_string(),
        })?;
    // An empty list means "clear the override" so the mount inherits the
    // workspace default (or the built-in defaults) again.
    if exclusions.is_empty() {
        mount.exclusions = None;
    } else {
        mount.exclusions = Some(exclusions.to_vec());
    }
    save_workspace(app_data_dir, &config)?;
    Ok(config)
}

/// Appends a new mount to the workspace and persists the config.
///
/// Rejects a mount whose path already exists (`DuplicateMount`). Returns the
/// updated config so the frontend can rescan the new mount and re-sync watchers.
pub fn add_mount(
    app_data_dir: &Path,
    workspace_id: &str,
    path: &str,
    permission: MountPermission,
) -> Result<WorkspaceConfig, AppError> {
    let mut config = load_workspace(app_data_dir, workspace_id)?;
    if config.mounts.iter().any(|mount| mount.path == path) {
        return Err(AppError::DuplicateMount {
            path: path.to_string(),
        });
    }
    config.mounts.push(MountConfig {
        path: path.to_string(),
        permission,
        exclusions: None,
    });
    save_workspace(app_data_dir, &config)?;
    Ok(config)
}

/// Removes a mount from the workspace and persists the config.
///
/// Unknown paths are rejected (`MountNotFound`). Returns the updated config.
pub fn remove_mount(
    app_data_dir: &Path,
    workspace_id: &str,
    path: &str,
) -> Result<WorkspaceConfig, AppError> {
    let mut config = load_workspace(app_data_dir, workspace_id)?;
    let index = config
        .mounts
        .iter()
        .position(|mount| mount.path == path)
        .ok_or_else(|| AppError::MountNotFound {
            workspace_id: workspace_id.to_string(),
            path: path.to_string(),
        })?;
    config.mounts.remove(index);
    save_workspace(app_data_dir, &config)?;
    Ok(config)
}

/// Updates a mount's permission and persists the config.
///
/// Unknown paths are rejected (`MountNotFound`). Returns the updated config.
pub fn set_mount_permission(
    app_data_dir: &Path,
    workspace_id: &str,
    path: &str,
    permission: MountPermission,
) -> Result<WorkspaceConfig, AppError> {
    let mut config = load_workspace(app_data_dir, workspace_id)?;
    let mount = config
        .mounts
        .iter_mut()
        .find(|mount| mount.path == path)
        .ok_or_else(|| AppError::MountNotFound {
            workspace_id: workspace_id.to_string(),
            path: path.to_string(),
        })?;
    mount.permission = permission;
    save_workspace(app_data_dir, &config)?;
    Ok(config)
}

pub fn update_workspace_exclusions(
    app_data_dir: &Path,
    workspace_id: &str,
    exclusions: &[String],
) -> Result<WorkspaceConfig, AppError> {
    let mut config = load_workspace(app_data_dir, workspace_id)?;
    config.exclusions = exclusions.to_vec();
    save_workspace(app_data_dir, &config)?;
    Ok(config)
}

pub fn list_workspaces(app_data_dir: &Path) -> Result<Vec<WorkspaceConfig>, AppError> {
    let dir = workspace_dir(app_data_dir)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| io_error(e, &dir))? {
        let entry = entry.map_err(|e| io_error(e, &dir))?;
        if entry.path().extension().and_then(|e| e.to_str()) == Some("json") {
            let id = entry.file_name().to_string_lossy().replace(".json", "");
            if let Ok(cfg) = load_workspace(app_data_dir, &id) {
                out.push(cfg);
            }
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
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
    use crate::errors::AppError;

    #[test]
    fn default_exclusions_match_spec() {
        assert_eq!(
            default_exclusions(),
            vec![
                ".git",
                "node_modules",
                "dist",
                "build",
                "target",
                ".venv",
                "venv",
                ".cache",
                "coverage"
            ]
        );
    }

    #[test]
    fn create_workspace_persists_and_loads() {
        let tmp = tempfile::tempdir().unwrap();
        let created = create_workspace(tmp.path(), "Personal").unwrap();
        assert_eq!(created.name, "Personal");
        assert_eq!(created.mounts.len(), 0);
        assert_eq!(created.schema_version, 1);
        assert_eq!(created.exclusions, default_exclusions());
        let loaded = load_workspace(tmp.path(), &created.id).unwrap();
        assert_eq!(loaded.id, created.id);
        assert_eq!(loaded.name, "Personal");
    }

    #[test]
    fn load_missing_workspace_returns_workspace_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        let err = load_workspace(tmp.path(), "nope").unwrap_err();
        match err {
            AppError::WorkspaceNotFound { id } => assert_eq!(id, "nope"),
            other => panic!("expected WorkspaceNotFound, got {other:?}"),
        }
    }

    #[test]
    fn save_round_trips_mounts_and_permissions() {
        let tmp = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(tmp.path(), "WS").unwrap();
        ws.exclusions = vec!["custom".to_string()];
        ws.mounts.push(MountConfig {
            path: "D:\\Notes".into(),
            permission: MountPermission::ReadOnly,
            exclusions: Some(vec!["tmp".into()]),
        });
        save_workspace(tmp.path(), &ws).unwrap();
        let loaded = load_workspace(tmp.path(), &ws.id).unwrap();
        assert_eq!(loaded.exclusions, vec!["custom"]);
        assert_eq!(loaded.mounts.len(), 1);
        assert_eq!(loaded.mounts[0].permission, MountPermission::ReadOnly);
        assert_eq!(
            loaded.mounts[0].exclusions.as_deref(),
            Some(&["tmp".to_string()][..])
        );
    }

    #[test]
    fn effective_exclusions_resolve_override_then_default() {
        let mut ws = create_workspace(tempfile::tempdir().unwrap().path(), "WS").unwrap();
        let override_mount = MountConfig {
            path: "a".into(),
            permission: MountPermission::ReadWrite,
            exclusions: Some(vec!["tmp".into()]),
        };
        assert_eq!(effective_exclusions(&ws, &override_mount), vec!["tmp"]);
        let default_mount = MountConfig {
            path: "b".into(),
            permission: MountPermission::ReadWrite,
            exclusions: None,
        };
        assert_eq!(
            effective_exclusions(&ws, &default_mount),
            default_exclusions()
        );
        ws.exclusions = vec!["custom".into()];
        assert_eq!(effective_exclusions(&ws, &default_mount), vec!["custom"]);
    }

    #[test]
    fn corrupt_config_returns_invalid_workspace_config() {
        let tmp = tempfile::tempdir().unwrap();
        let id = "abc";
        let dir = workspace_dir(tmp.path()).unwrap();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(format!("{id}.json")), b"not json{{").unwrap();
        let err = load_workspace(tmp.path(), id).unwrap_err();
        match err {
            AppError::InvalidWorkspaceConfig { id: got } => assert_eq!(got, id),
            other => panic!("expected InvalidWorkspaceConfig, got {other:?}"),
        }
    }

    #[test]
    fn unsupported_schema_version_returns_invalid_workspace_config() {
        let tmp = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(tmp.path(), "WS").unwrap();
        ws.schema_version = 999;
        save_workspace(tmp.path(), &ws).unwrap();
        let err = load_workspace(tmp.path(), &ws.id).unwrap_err();
        match err {
            AppError::InvalidWorkspaceConfig { id: got } => assert_eq!(got, ws.id),
            other => panic!("expected InvalidWorkspaceConfig, got {other:?}"),
        }
    }

    #[test]
    fn mount_permission_serializes_kebab_case() {
        assert_eq!(
            serde_json::to_string(&MountPermission::ReadWrite).unwrap(),
            "\"read-write\""
        );
        assert_eq!(
            serde_json::to_string(&MountPermission::ReadOnly).unwrap(),
            "\"read-only\""
        );
        assert_eq!(
            serde_json::to_string(&MountPermission::Excluded).unwrap(),
            "\"excluded\""
        );
    }

    #[test]
    fn list_workspaces_sorts_by_name_and_skips_corrupt_files() {
        let tmp = tempfile::tempdir().unwrap();
        let second = create_workspace(tmp.path(), "Beta").unwrap();
        let first = create_workspace(tmp.path(), "Alpha").unwrap();
        let dir = workspace_dir(tmp.path()).unwrap();
        std::fs::write(dir.join("corrupt.json"), b"nope{{").unwrap();

        let list = list_workspaces(tmp.path()).unwrap();
        let names: Vec<&str> = list.iter().map(|w| w.name.as_str()).collect();
        assert_eq!(names, vec!["Alpha", "Beta"]);
        assert_eq!(list[0].id, first.id);
        assert_eq!(list[1].id, second.id);
    }

    #[test]
    fn update_mount_exclusions_saves_override_and_returns_config() {
        let tmp = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(tmp.path(), "WS").unwrap();
        ws.mounts.push(MountConfig {
            path: "D:\\Notes".into(),
            permission: MountPermission::ReadWrite,
            exclusions: None,
        });
        save_workspace(tmp.path(), &ws).unwrap();

        let updated =
            update_mount_exclusions(tmp.path(), &ws.id, "D:\\Notes", &["tmp".to_string()]).unwrap();

        assert_eq!(
            updated.mounts[0].exclusions.as_deref(),
            Some(&["tmp".to_string()][..])
        );
        assert_eq!(updated.exclusions, default_exclusions());
        let loaded = load_workspace(tmp.path(), &ws.id).unwrap();
        assert_eq!(
            loaded.mounts[0].exclusions.as_deref(),
            Some(&["tmp".to_string()][..])
        );
    }

    #[test]
    fn update_mount_exclusions_with_empty_clears_override() {
        let tmp = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(tmp.path(), "WS").unwrap();
        ws.mounts.push(MountConfig {
            path: "D:\\Notes".into(),
            permission: MountPermission::ReadWrite,
            exclusions: Some(vec!["tmp".to_string()]),
        });
        save_workspace(tmp.path(), &ws).unwrap();

        let updated = update_mount_exclusions(tmp.path(), &ws.id, "D:\\Notes", &[]).unwrap();

        assert_eq!(updated.mounts[0].exclusions, None);
        assert_eq!(
            effective_exclusions(&updated, &updated.mounts[0]),
            default_exclusions()
        );
        let loaded = load_workspace(tmp.path(), &ws.id).unwrap();
        assert_eq!(loaded.mounts[0].exclusions, None);
    }

    #[test]
    fn update_mount_exclusions_unknown_mount_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = create_workspace(tmp.path(), "WS").unwrap();
        let err = update_mount_exclusions(tmp.path(), &ws.id, "NOPE", &[]).unwrap_err();
        match err {
            AppError::MountNotFound { workspace_id, path } => {
                assert_eq!(workspace_id, ws.id);
                assert_eq!(path, "NOPE");
            }
            other => panic!("expected MountNotFound, got {other:?}"),
        }
    }

    #[test]
    fn add_mount_appends_and_persists() {
        let tmp = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(tmp.path(), "WS").unwrap();
        ws.mounts.push(MountConfig {
            path: "C:\\notes".into(),
            permission: MountPermission::ReadWrite,
            exclusions: None,
        });
        save_workspace(tmp.path(), &ws).unwrap();

        let updated =
            add_mount(tmp.path(), &ws.id, "D:\\vault", MountPermission::ReadOnly).unwrap();

        assert_eq!(updated.mounts.len(), 2);
        assert_eq!(updated.mounts[1].path, "D:\\vault");
        assert_eq!(updated.mounts[1].permission, MountPermission::ReadOnly);
        assert_eq!(updated.mounts[1].exclusions, None);
        let loaded = load_workspace(tmp.path(), &ws.id).unwrap();
        assert_eq!(loaded.mounts.len(), 2);
        assert_eq!(loaded.mounts[1].permission, MountPermission::ReadOnly);
    }

    #[test]
    fn add_mount_rejects_duplicate_path() {
        let tmp = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(tmp.path(), "WS").unwrap();
        ws.mounts.push(MountConfig {
            path: "D:\\notes".into(),
            permission: MountPermission::ReadWrite,
            exclusions: None,
        });
        save_workspace(tmp.path(), &ws).unwrap();

        let err =
            add_mount(tmp.path(), &ws.id, "D:\\notes", MountPermission::ReadWrite).unwrap_err();
        match err {
            AppError::DuplicateMount { path } => assert_eq!(path, "D:\\notes"),
            other => panic!("expected DuplicateMount, got {other:?}"),
        }
    }

    #[test]
    fn remove_mount_removes_and_persists() {
        let tmp = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(tmp.path(), "WS").unwrap();
        ws.mounts.push(MountConfig {
            path: "D:\\notes".into(),
            permission: MountPermission::ReadWrite,
            exclusions: None,
        });
        ws.mounts.push(MountConfig {
            path: "D:\\wiki".into(),
            permission: MountPermission::ReadOnly,
            exclusions: None,
        });
        save_workspace(tmp.path(), &ws).unwrap();

        let updated = remove_mount(tmp.path(), &ws.id, "D:\\notes").unwrap();

        assert_eq!(updated.mounts.len(), 1);
        assert_eq!(updated.mounts[0].path, "D:\\wiki");
        let loaded = load_workspace(tmp.path(), &ws.id).unwrap();
        assert_eq!(loaded.mounts.len(), 1);
    }

    #[test]
    fn remove_mount_unknown_path_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = create_workspace(tmp.path(), "WS").unwrap();
        let err = remove_mount(tmp.path(), &ws.id, "NOPE").unwrap_err();
        match err {
            AppError::MountNotFound { workspace_id, path } => {
                assert_eq!(workspace_id, ws.id);
                assert_eq!(path, "NOPE");
            }
            other => panic!("expected MountNotFound, got {other:?}"),
        }
    }

    #[test]
    fn set_mount_permission_updates_and_persists() {
        let tmp = tempfile::tempdir().unwrap();
        let mut ws = create_workspace(tmp.path(), "WS").unwrap();
        ws.mounts.push(MountConfig {
            path: "D:\\notes".into(),
            permission: MountPermission::ReadWrite,
            exclusions: None,
        });
        save_workspace(tmp.path(), &ws).unwrap();

        let updated =
            set_mount_permission(tmp.path(), &ws.id, "D:\\notes", MountPermission::Excluded)
                .unwrap();

        assert_eq!(updated.mounts[0].permission, MountPermission::Excluded);
        let loaded = load_workspace(tmp.path(), &ws.id).unwrap();
        assert_eq!(loaded.mounts[0].permission, MountPermission::Excluded);
    }

    #[test]
    fn set_mount_permission_unknown_path_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = create_workspace(tmp.path(), "WS").unwrap();
        let err = set_mount_permission(tmp.path(), &ws.id, "NOPE", MountPermission::ReadOnly)
            .unwrap_err();
        match err {
            AppError::MountNotFound { workspace_id, path } => {
                assert_eq!(workspace_id, ws.id);
                assert_eq!(path, "NOPE");
            }
            other => panic!("expected MountNotFound, got {other:?}"),
        }
    }

    #[test]
    fn update_workspace_exclusions_saves_and_returns_config() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = create_workspace(tmp.path(), "WS").unwrap();
        let updated =
            update_workspace_exclusions(tmp.path(), &ws.id, &["custom".to_string()]).unwrap();
        assert_eq!(updated.exclusions, vec!["custom"]);
        let loaded = load_workspace(tmp.path(), &ws.id).unwrap();
        assert_eq!(loaded.exclusions, vec!["custom"]);
    }
}
