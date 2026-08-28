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

function isPathWithinMount(path: string, mountPath: string): boolean {
  if (path === mountPath) return true;
  return path.startsWith(mountPath + "\\") || path.startsWith(mountPath + "/");
}

let savePromise: Promise<boolean> | null = null;

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
  /** Follows an external rename of the active document (a follow, not a reload). */
  handleWatcherRename(from: string, to: string): void;
  /** Follows a rename of the document from `from` to `to`, keeping its content. */
  followRename(from: string, to: string): void;
  /**
   * Closes the active document when it lives inside the mount being removed.
   * Returns true when nothing is dirty (removal may proceed), false when the
   * caller must invoke the unsaved-changes guard first.
   */
  closeIfInMount(mountPath: string): boolean;
  /** Resets all open-document state (used when the user discards changes). */
  clearDocument(): void;
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
    const { document, draft, dirty, fileMissing } = get();
    if (document === null || !dirty) return true;
    if (fileMissing) return false;
    if (savePromise !== null) return savePromise;
    const promise = (async (): Promise<boolean> => {
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
      } finally {
        savePromise = null;
      }
    })();
    savePromise = promise;
    return promise;
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
    const { pendingPath, fileMissing } = get();
    if (pendingPath === null) return;
    if (fileMissing) return;
    const saved = await get().save();
    set({ pendingPath: null });
    if (!saved) return;
    await get().loadDocument(pendingPath);
  },
  discardAndOpenPending: async () => {
    const { pendingPath } = get();
    if (pendingPath === null) return;
    set({ pendingPath: null });
    get().clearDocument();
    await get().loadDocument(pendingPath);
  },
  cancelOpenRequest: () => set({ pendingPath: null }),
  setFileMissing: (value) => set({ fileMissing: value }),
  handleWatcherRename: (from, to) => {
    get().followRename(from, to);
  },
  followRename: (from, to) => {
    const { document, pendingPath } = get();
    if (document === null || document.path !== from) return;
    set({
      document: { ...document, path: to },
      pendingPath: pendingPath === from ? to : pendingPath,
      fileMissing: false,
    });
  },
  closeIfInMount: (mountPath) => {
    const { document, dirty } = get();
    if (document === null || !isPathWithinMount(document.path, mountPath)) return true;
    if (dirty) return false;
    set({
      document: null,
      draft: "",
      dirty: false,
      error: null,
      fileMissing: false,
    });
    return true;
  },
  clearDocument: () => {
    set({
      document: null,
      draft: "",
      dirty: false,
      loading: false,
      error: null,
      conflict: false,
      pendingPath: null,
      fileMissing: false,
    });
  },
}));
