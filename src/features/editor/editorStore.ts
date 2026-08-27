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
  pendingPath: string | null;
  fileMissing: boolean;
  loadDocument(path: string): Promise<void>;
  setDraft(value: string): void;
  replaceSnapshot(snapshot: TextDocumentSnapshot): void;
  /** Returns true when the draft is safely persisted (or there was nothing to save). */
  save(): Promise<boolean>;
  dismissConflict(): void;
  requestOpenDocument(path: string): void;
  saveAndOpenPending(): Promise<void>;
  discardAndOpenPending(): Promise<void>;
  cancelOpenRequest(): void;
  setFileMissing(value: boolean): void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  document: null,
  draft: "",
  dirty: false,
  loading: false,
  saving: false,
  conflict: false,
  error: null,
  pendingPath: null,
  fileMissing: false,
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
        fileMissing: false,
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
    const { document, draft, dirty, saving, fileMissing } = get();
    if (document === null || !dirty) return true;
    if (fileMissing) return false;
    if (saving) return false;
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
      return true;
    } catch (error) {
      set({ saving: false });
      if (isExternalModificationConflict(error)) {
        set({ conflict: true });
      } else {
        set({ error: toErrorMessage(error) });
      }
      return false;
    }
  },
  dismissConflict: () => set({ conflict: false }),
  requestOpenDocument: (path) => {
    const { document, dirty } = get();
    if (document !== null && path === document.path) return;
    if (dirty) {
      set({ pendingPath: path });
      return;
    }
    void get().loadDocument(path);
  },
  saveAndOpenPending: async () => {
    const { pendingPath } = get();
    if (pendingPath === null) return;
    const saved = await get().save();
    set({ pendingPath: null });
    if (!saved) return;
    await get().loadDocument(pendingPath);
  },
  discardAndOpenPending: async () => {
    const { pendingPath } = get();
    if (pendingPath === null) return;
    set({ pendingPath: null });
    await get().loadDocument(pendingPath);
  },
  cancelOpenRequest: () => set({ pendingPath: null }),
  setFileMissing: (value) => set({ fileMissing: value }),
}));
