//! Watcher event shapes emitted to the frontend.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum WatcherEvent {
    Created { path: String },
    Removed { path: String },
    Renamed { from: String, to: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn created_serializes_as_tagged_camel_case() {
        let json = serde_json::to_value(WatcherEvent::Created {
            path: "C:\\notes\\a.md".into(),
        })
        .expect("created must serialize");
        assert_eq!(
            json,
            serde_json::json!({ "kind": "created", "path": "C:\\notes\\a.md" })
        );
    }

    #[test]
    fn removed_serializes_as_tagged_camel_case() {
        let json = serde_json::to_value(WatcherEvent::Removed {
            path: "C:\\notes\\a.md".into(),
        })
        .expect("removed must serialize");
        assert_eq!(
            json,
            serde_json::json!({ "kind": "removed", "path": "C:\\notes\\a.md" })
        );
    }

    #[test]
    fn renamed_serializes_as_tagged_camel_case() {
        let json = serde_json::to_value(WatcherEvent::Renamed {
            from: "C:\\notes\\a.md".into(),
            to: "C:\\notes\\b.md".into(),
        })
        .expect("renamed must serialize");
        assert_eq!(
            json,
            serde_json::json!({
                "kind": "renamed",
                "from": "C:\\notes\\a.md",
                "to": "C:\\notes\\b.md"
            })
        );
    }
}
