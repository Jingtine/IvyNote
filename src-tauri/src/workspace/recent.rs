use std::fs;
use std::path::Path;

use crate::errors::AppError;

const MAX_RECENT: usize = 8;

fn recent_file(app_data_dir: &Path) -> Result<std::path::PathBuf, AppError> {
    let dir = app_data_dir.join("workspaces");
    fs::create_dir_all(&dir).map_err(|e| AppError::Io {
        message: e.to_string(),
    })?;
    Ok(dir.join("recent.json"))
}

pub fn push_recent(app_data_dir: &Path, id: &str) -> Result<(), AppError> {
    let mut recent = load_recent(app_data_dir)?;
    recent.retain(|x| x != id);
    recent.insert(0, id.to_string());
    recent.truncate(MAX_RECENT);
    let path = recent_file(app_data_dir)?;
    let bytes = serde_json::to_vec_pretty(&recent).map_err(|e| AppError::Io {
        message: e.to_string(),
    })?;
    let tmp = path.with_extension(format!("tmp-{}", std::process::id()));
    fs::write(&tmp, &bytes).map_err(|e| AppError::Io {
        message: e.to_string(),
    })?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        AppError::Io {
            message: e.to_string(),
        }
    })?;
    Ok(())
}

pub fn load_recent(app_data_dir: &Path) -> Result<Vec<String>, AppError> {
    let path = recent_file(app_data_dir)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = fs::read(&path).map_err(|e| AppError::Io {
        message: e.to_string(),
    })?;
    Ok(serde_json::from_slice(&bytes).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_caps_at_eight_and_dedupes() {
        let tmp = tempfile::tempdir().unwrap();
        for i in 0..10 {
            push_recent(tmp.path(), &format!("id{i}")).unwrap();
        }
        let recent = load_recent(tmp.path()).unwrap();
        assert_eq!(recent.len(), 8);
        assert_eq!(recent[0], "id9"); // most recent first
                                      // dedupe: re-push an existing id moves it to front
        push_recent(tmp.path(), "id5").unwrap();
        let recent = load_recent(tmp.path()).unwrap();
        assert_eq!(recent[0], "id5");
        assert_eq!(recent.iter().filter(|x| *x == "id5").count(), 1);
    }

    #[test]
    fn recent_empty_when_none() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(load_recent(tmp.path()).unwrap().is_empty());
    }
}
