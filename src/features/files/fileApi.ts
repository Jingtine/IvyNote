import { invoke } from "@tauri-apps/api/core";
import type {
  SaveTextDocumentRequest,
  SaveTextDocumentResult,
  TextDocumentSnapshot,
} from "./fileTypes";

export async function readMarkdownFile(path: string): Promise<TextDocumentSnapshot> {
  return invoke<TextDocumentSnapshot>("read_markdown_file", { path });
}

export async function saveMarkdownDocument(
  request: SaveTextDocumentRequest,
): Promise<SaveTextDocumentResult> {
  return invoke<SaveTextDocumentResult>("save_markdown_file", { request });
}
