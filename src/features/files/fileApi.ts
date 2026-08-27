import { invoke } from "@tauri-apps/api/core";
import type { TextDocumentSnapshot } from "./fileTypes";

export async function readMarkdownFile(path: string): Promise<TextDocumentSnapshot> {
  return invoke<TextDocumentSnapshot>("read_markdown_file", { path });
}
