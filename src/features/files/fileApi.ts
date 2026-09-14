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
  workspaceId: string,
  request: SaveTextDocumentRequest,
): Promise<SaveTextDocumentResult> {
  return invoke<SaveTextDocumentResult>("save_markdown_file", { workspaceId, request });
}

export async function createFolder(
  workspaceId: string,
  parent: string,
  name: string,
): Promise<string> {
  return invoke<string>("create_folder", { workspaceId, parent, name });
}

export async function createMarkdown(
  workspaceId: string,
  parent: string,
  name: string,
): Promise<string> {
  return invoke<string>("create_markdown", { workspaceId, parent, name });
}

export async function renamePath(
  workspaceId: string,
  path: string,
  newName: string,
): Promise<string> {
  return invoke<string>("rename_path", { workspaceId, path, newName });
}

export async function movePath(
  workspaceId: string,
  path: string,
  targetDir: string,
): Promise<string> {
  return invoke<string>("move_path", { workspaceId, path, targetDir });
}

export async function deleteToTrash(workspaceId: string, path: string): Promise<void> {
  return invoke<void>("delete_to_trash", { workspaceId, path });
}
