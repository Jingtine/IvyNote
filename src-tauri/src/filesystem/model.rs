use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub kind: FileNodeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileTreeNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FileNodeKind {
    Directory,
    Markdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NewlineStyle {
    Lf,
    CrLf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDocumentSnapshot {
    pub path: String,
    pub content: String,
    pub modified_at_ms: u64,
    pub size: u64,
    pub newline: NewlineStyle,
    pub has_utf8_bom: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTextDocumentRequest {
    pub path: String,
    pub content: String,
    pub expected_modified_at_ms: u64,
    pub expected_size: u64,
    pub newline: NewlineStyle,
    pub has_utf8_bom: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveTextDocumentResult {
    pub modified_at_ms: u64,
    pub size: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_document_snapshot_serializes_camel_case() {
        let snapshot = TextDocumentSnapshot {
            path: "notes/a.md".to_string(),
            content: "# Hello".to_string(),
            modified_at_ms: 1_700_000_000_000,
            size: 7,
            newline: NewlineStyle::CrLf,
            has_utf8_bom: true,
        };
        let json = serde_json::to_value(&snapshot).expect("snapshot must serialize");
        assert_eq!(
            json["modifiedAtMs"],
            serde_json::json!(1_700_000_000_000u64)
        );
        assert_eq!(json["hasUtf8Bom"], true);
        assert_eq!(json["newline"], "crlf");
        assert_eq!(json["path"], "notes/a.md");
        assert_eq!(json["content"], "# Hello");
        assert_eq!(json["size"], 7);
    }

    #[test]
    fn newline_style_serializes_to_stable_values() {
        assert_eq!(serde_json::to_value(NewlineStyle::Lf).unwrap(), "lf");
        assert_eq!(serde_json::to_value(NewlineStyle::CrLf).unwrap(), "crlf");
    }

    #[test]
    fn newline_style_deserializes_from_stable_values() {
        assert_eq!(
            serde_json::from_value::<NewlineStyle>(serde_json::json!("lf")).unwrap(),
            NewlineStyle::Lf
        );
        assert_eq!(
            serde_json::from_value::<NewlineStyle>(serde_json::json!("crlf")).unwrap(),
            NewlineStyle::CrLf
        );
    }

    #[test]
    fn file_tree_node_serializes_camel_case_kinds() {
        let node = FileTreeNode {
            name: "notes".to_string(),
            path: "notes".to_string(),
            kind: FileNodeKind::Directory,
            children: Some(vec![FileTreeNode {
                name: "a.md".to_string(),
                path: "notes/a.md".to_string(),
                kind: FileNodeKind::Markdown,
                children: None,
            }]),
        };
        let json = serde_json::to_value(&node).expect("node must serialize");
        assert_eq!(json["kind"], "directory");
        assert_eq!(json["children"][0]["kind"], "markdown");
        assert_eq!(json["children"][0]["name"], "a.md");
    }

    #[test]
    fn file_tree_node_leaf_omits_children_key() {
        let leaf = FileTreeNode {
            name: "a.md".to_string(),
            path: "notes/a.md".to_string(),
            kind: FileNodeKind::Markdown,
            children: None,
        };
        let json = serde_json::to_value(&leaf).expect("leaf must serialize");
        assert!(
            json.get("children").is_none(),
            "leaf node must not serialize a children key, got: {json}"
        );
    }

    #[test]
    fn file_tree_node_directory_keeps_children_key() {
        let dir = FileTreeNode {
            name: "notes".to_string(),
            path: "notes".to_string(),
            kind: FileNodeKind::Directory,
            children: Some(vec![FileTreeNode {
                name: "a.md".to_string(),
                path: "notes/a.md".to_string(),
                kind: FileNodeKind::Markdown,
                children: None,
            }]),
        };
        let json = serde_json::to_value(&dir).expect("directory must serialize");
        assert!(
            json.get("children").is_some(),
            "directory node must serialize a children key, got: {json}"
        );
        assert_eq!(json["children"].as_array().map(Vec::len), Some(1));
        assert!(json["children"][0].get("children").is_none());
    }

    #[test]
    fn file_tree_node_deserializes_without_children() {
        let node: FileTreeNode = serde_json::from_value(serde_json::json!({
            "name": "a.md",
            "path": "notes/a.md",
            "kind": "markdown"
        }))
        .expect("node without children must deserialize");
        assert_eq!(node.name, "a.md");
        assert_eq!(node.path, "notes/a.md");
        assert!(node.children.is_none());
    }

    #[test]
    fn save_text_document_request_deserializes_camel_case() {
        let request: SaveTextDocumentRequest = serde_json::from_value(serde_json::json!({
            "path": "notes/a.md",
            "content": "# Updated",
            "expectedModifiedAtMs": 1234,
            "expectedSize": 9,
            "newline": "lf",
            "hasUtf8Bom": false
        }))
        .expect("request must deserialize");
        assert_eq!(request.path, "notes/a.md");
        assert_eq!(request.content, "# Updated");
        assert_eq!(request.expected_modified_at_ms, 1234);
        assert_eq!(request.expected_size, 9);
        assert_eq!(request.newline, NewlineStyle::Lf);
        assert!(!request.has_utf8_bom);
    }

    #[test]
    fn save_text_document_result_serializes_camel_case() {
        let result = SaveTextDocumentResult {
            modified_at_ms: 42,
            size: 99,
        };
        let json = serde_json::to_value(&result).expect("result must serialize");
        assert_eq!(json["modifiedAtMs"], 42);
        assert_eq!(json["size"], 99);
    }
}
