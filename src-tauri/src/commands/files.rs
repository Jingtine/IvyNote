use std::path::Path;

use crate::errors::AppError;
use crate::filesystem::model::TextDocumentSnapshot;
use crate::filesystem::reader::read_text_document;

/// Reads a Markdown file into a snapshot with encoding metadata.
///
/// Thin delegation only: all reading logic lives in the reader service.
#[tauri::command]
pub fn read_markdown_file(path: String) -> Result<TextDocumentSnapshot, AppError> {
    read_text_document(Path::new(&path))
}
