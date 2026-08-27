import { create } from "zustand";

import { readMarkdownFile } from "../files/fileApi";
import type { TextDocumentSnapshot } from "../files/fileTypes";
import { isExternalModificationConflict, saveDocument } from "./saveDocument";

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
  saving: boolean;
  conflict: boolean;
  error: string | null;
  loadDocument(path: string): Promise<void>;
  setDraft(value: string): void;
  replaceSnapshot(snapshot: TextDocumentSnapshot): void;
  save(): Promise<void>;
  dismissConflict(): void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  document: null,
  draft: "",
  dirty: false,
  loading: false,
  saving: false,
  conflict: false,
  error: null,
  loadDocument: async (path) => {
    set({ loading: true, error: null, conflict: false });
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
  save: async () => {
    const { document, draft, dirty, saving } = get();
    if (document === null || !dirty || saving) return;
    set({ saving: true, conflict: false });
    try {
      const result = await saveDocument(document, draft);
      get().replaceSnapshot({
        ...document,
        content: draft,
        modifiedAtMs: result.modifiedAtMs,
        size: result.size,
      });
      set({ saving: false });
    } catch (error) {
      set({ saving: false });
      if (isExternalModificationConflict(error)) {
        set({ conflict: true });
      } else {
        set({ error: toErrorMessage(error) });
      }
    }
  },
  dismissConflict: () => set({ conflict: false }),
}));
