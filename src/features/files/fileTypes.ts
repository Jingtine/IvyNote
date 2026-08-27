export type FileNodeKind = "directory" | "markdown";

export interface FileTreeNode {
  name: string;
  path: string;
  kind: FileNodeKind;
  children?: FileTreeNode[];
}

export type NewlineStyle = "lf" | "crlf";

export interface TextDocumentSnapshot {
  path: string;
  content: string;
  modifiedAtMs: number;
  size: number;
  newline: NewlineStyle;
  hasUtf8Bom: boolean;
}

export interface SaveTextDocumentRequest {
  path: string;
  content: string;
  expectedModifiedAtMs: number;
  expectedSize: number;
  newline: NewlineStyle;
  hasUtf8Bom: boolean;
}

export interface SaveTextDocumentResult {
  modifiedAtMs: number;
  size: number;
}
