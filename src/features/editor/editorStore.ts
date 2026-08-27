import { create } from "zustand";

import { readMarkdownFile } from "../files/fileApi";
import type { TextDocumentSnapshot } from "../files/fileTypes";

function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export interface EditorState {
  document: TextDocumentSnapshot | null;
  draft: string;
  dirty: boolean;
  loading: boolean;
  error: string | null;
  loadDocument(path: string): Promise<void>;
  setDraft(value: string): void;
  replaceSnapshot(snapshot: TextDocumentSnapshot): void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  document: null,
  draft: "",
  dirty: false,
  loading: false,
  error: null,
  loadDocument: async (path) => {
    set({ loading: true, error: null });
    try {
      const snapshot = await readMarkdownFile(path);
      set({
        document: snapshot,
        draft: normalizeContent(snapshot.content),
        dirty: false,
        loading: false,
        error: null,
      });
    } catch (error) {
      set({ loading: false, error: toErrorMessage(error) });
    }
  },
  setDraft: (value) => {
    const document = get().document;
    const dirty = document !== null && value !== normalizeContent(document.content);
    if (dirty) {
      set({ draft: value, dirty, error: null });
    } else {
      set({ draft: value, dirty });
    }
  },
  replaceSnapshot: (snapshot) => {
    set({
      document: snapshot,
      draft: normalizeContent(snapshot.content),
      dirty: false,
      error: null,
    });
  },
}));
