use serde::{Serialize, Serializer};

#[derive(Debug, Clone)]
pub enum AppError {
    FileNotFound { path: String },
    PermissionDenied { path: String },
    InvalidPath { path: String },
    UnsupportedEncoding { path: String },
    ExternalModificationConflict { path: String },
    Io { message: String },
    WorkspaceNotFound { id: String },
    InvalidWorkspaceConfig { id: String },
    CrossMountMoveNotAllowed { path: String },
    MountNotFound { workspace_id: String, path: String },
}

impl AppError {
    fn payload(&self) -> AppErrorPayload<'_> {
        match self {
            AppError::FileNotFound { path } => AppErrorPayload {
                code: "fileNotFound",
                message: format!("File not found: {path}"),
                path: Some(path),
            },
            AppError::PermissionDenied { path } => AppErrorPayload {
                code: "permissionDenied",
                message: format!("Permission denied: {path}"),
                path: Some(path),
            },
            AppError::InvalidPath { path } => AppErrorPayload {
                code: "invalidPath",
                message: format!("Invalid path: {path}"),
                path: Some(path),
            },
            AppError::UnsupportedEncoding { path } => AppErrorPayload {
                code: "unsupportedEncoding",
                message: format!("Unsupported encoding, expected UTF-8: {path}"),
                path: Some(path),
            },
            AppError::ExternalModificationConflict { path } => AppErrorPayload {
                code: "externalModificationConflict",
                message: format!("File was modified externally: {path}"),
                path: Some(path),
            },
            AppError::Io { message } => AppErrorPayload {
                code: "io",
                message: message.clone(),
                path: None,
            },
            AppError::WorkspaceNotFound { id } => AppErrorPayload {
                code: "workspaceNotFound",
                message: format!("Workspace not found: {id}"),
                path: None,
            },
            AppError::InvalidWorkspaceConfig { id } => AppErrorPayload {
                code: "invalidWorkspaceConfig",
                message: format!("Invalid workspace config: {id}"),
                path: None,
            },
            AppError::CrossMountMoveNotAllowed { path } => AppErrorPayload {
                code: "crossMountMoveNotAllowed",
                message: format!("Cannot move across mounts: {path}"),
                path: Some(path),
            },
            AppError::MountNotFound { workspace_id, path } => AppErrorPayload {
                code: "mountNotFound",
                message: format!("Mount not found in workspace {workspace_id}: {path}"),
                path: Some(path),
            },
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.payload().serialize(serializer)
    }
}

#[derive(Serialize)]
struct AppErrorPayload<'a> {
    code: &'a str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    path: Option<&'a str>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_not_found_serializes_stable_code_and_path() {
        let error = AppError::FileNotFound {
            path: "notes/missing.md".to_string(),
        };
        let json = serde_json::to_value(&error).expect("error must serialize");
        assert_eq!(json["code"], "fileNotFound");
        assert_eq!(json["path"], "notes/missing.md");
        assert!(json["message"].as_str().unwrap().contains("missing.md"));
    }

    #[test]
    fn permission_denied_serializes_stable_code_and_path() {
        let error = AppError::PermissionDenied {
            path: "secret.md".to_string(),
        };
        let json = serde_json::to_value(&error).expect("error must serialize");
        assert_eq!(json["code"], "permissionDenied");
        assert_eq!(json["path"], "secret.md");
    }

    #[test]
    fn invalid_path_serializes_stable_code_and_path() {
        let error = AppError::InvalidPath {
            path: "bad\0path".to_string(),
        };
        let json = serde_json::to_value(&error).expect("error must serialize");
        assert_eq!(json["code"], "invalidPath");
        assert_eq!(json["path"], "bad\0path");
    }

    #[test]
    fn unsupported_encoding_serializes_stable_code_and_path() {
        let error = AppError::UnsupportedEncoding {
            path: "binary.md".to_string(),
        };
        let json = serde_json::to_value(&error).expect("error must serialize");
        assert_eq!(json["code"], "unsupportedEncoding");
        assert_eq!(json["path"], "binary.md");
    }

    #[test]
    fn external_modification_conflict_serializes_stable_code_and_path() {
        let error = AppError::ExternalModificationConflict {
            path: "changed.md".to_string(),
        };
        let json = serde_json::to_value(&error).expect("error must serialize");
        assert_eq!(json["code"], "externalModificationConflict");
        assert_eq!(json["path"], "changed.md");
    }

    #[test]
    fn io_serializes_stable_code_and_message_without_path() {
        let error = AppError::Io {
            message: "disk unavailable".to_string(),
        };
        let json = serde_json::to_value(&error).expect("error must serialize");
        assert_eq!(json["code"], "io");
        assert_eq!(json["message"], "disk unavailable");
        assert!(json.get("path").is_none());
    }

    #[test]
    fn workspace_not_found_serializes_stable_code_and_message_without_path() {
        let error = AppError::WorkspaceNotFound {
            id: "abc123".to_string(),
        };
        let json = serde_json::to_value(&error).expect("error must serialize");
        assert_eq!(json["code"], "workspaceNotFound");
        assert!(json["message"].as_str().unwrap().contains("abc123"));
        assert!(json.get("path").is_none());
    }

    #[test]
    fn cross_mount_move_not_allowed_serializes_stable_code_and_path() {
        let error = AppError::CrossMountMoveNotAllowed {
            path: "notes.md".to_string(),
        };
        let json = serde_json::to_value(&error).expect("error must serialize");
        assert_eq!(json["code"], "crossMountMoveNotAllowed");
        assert_eq!(json["path"], "notes.md");
        assert!(json["message"].as_str().unwrap().contains("notes.md"));
    }

    #[test]
    fn invalid_workspace_config_serializes_stable_code_and_message_without_path() {
        let error = AppError::InvalidWorkspaceConfig {
            id: "abc123".to_string(),
        };
        let json = serde_json::to_value(&error).expect("error must serialize");
        assert_eq!(json["code"], "invalidWorkspaceConfig");
        assert!(json["message"].as_str().unwrap().contains("abc123"));
        assert!(json.get("path").is_none());
    }

    #[test]
    fn mount_not_found_serializes_stable_code_and_path() {
        let error = AppError::MountNotFound {
            workspace_id: "ws-1".to_string(),
            path: "D:\\Notes".to_string(),
        };
        let json = serde_json::to_value(&error).expect("error must serialize");
        assert_eq!(json["code"], "mountNotFound");
        assert_eq!(json["path"], "D:\\Notes");
        assert!(json["message"].as_str().unwrap().contains("D:\\Notes"));
    }
}
