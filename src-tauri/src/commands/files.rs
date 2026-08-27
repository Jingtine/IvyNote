use std::path::Path;

use crate::errors::AppError;
use crate::filesystem::model::{
    SaveTextDocumentRequest, SaveTextDocumentResult, TextDocumentSnapshot,
};
use crate::filesystem::reader::read_text_document;
use crate::filesystem::writer::save_text_document;

/// Reads a Markdown file into a snapshot with encoding metadata.
///
/// Thin delegation only: all reading logic lives in the reader service.
#[tauri::command]
pub fn read_markdown_file(path: String) -> Result<TextDocumentSnapshot, AppError> {
    read_text_document(Path::new(&path))
}

/// Saves editor content back to the Markdown file atomically.
///
/// Thin delegation only: all writing logic lives in the writer service.
#[tauri::command]
pub fn save_markdown_file(
    request: SaveTextDocumentRequest,
) -> Result<SaveTextDocumentResult, AppError> {
    save_text_document(request)
}
