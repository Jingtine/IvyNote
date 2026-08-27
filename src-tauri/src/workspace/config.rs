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
    serde_json::from_slice(&bytes)
        .map_err(|_| AppError::InvalidWorkspaceConfig { id: id.to_string() })
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
}
