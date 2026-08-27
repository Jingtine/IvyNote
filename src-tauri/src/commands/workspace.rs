use std::path::Path;

use crate::errors::AppError;
use crate::filesystem::model::FileTreeNode;
use crate::filesystem::scanner::scan_markdown_tree;

/// Scans a workspace root directory for its Markdown file tree.
///
/// Thin delegation only: all scanning logic lives in the scanner service.
#[tauri::command]
pub fn scan_root(root: String) -> Result<Vec<FileTreeNode>, AppError> {
    scan_markdown_tree(Path::new(&root))
}
