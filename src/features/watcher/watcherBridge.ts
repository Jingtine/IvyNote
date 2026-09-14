import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";

import { useEditorStore } from "../editor/editorStore";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { isPathWithinOrEqual } from "../../shared/utils/paths";
import type { WatcherEvent } from "./watcherTypes";

/** Subscribes to Rust `watcher://event` emissions and dispatches them. */
export async function subscribeToWatcherEvents(): Promise<UnlistenFn> {
  return listen<WatcherEvent>("watcher://event", (event) => {
    dispatchWatcherEvent(event.payload);
  });
}

export function dispatchWatcherEvent(event: WatcherEvent): void {
  switch (event.kind) {
    case "created":
    case "removed":
      if (event.kind === "removed" && isActiveDocument(event.path)) {
        useEditorStore.getState().setFileMissing(true);
      }
      void useWorkspaceStore.getState().refreshTree();
      break;
    case "renamed": {
      if (isActiveDocumentRenamedFrom(event.from)) {
        useEditorStore.getState().handleWatcherRename(event.from, event.to);
      }
      void useWorkspaceStore.getState().refreshTree();
      break;
    }
  }
}

function isActiveDocument(path: string): boolean {
  const document = useEditorStore.getState().document;
  return document !== null && document.path === path;
}

/** True when `from` is the active document or one of its parent directories. */
function isActiveDocumentRenamedFrom(from: string): boolean {
  const document = useEditorStore.getState().document;
  if (document === null) return false;
  return isPathWithinOrEqual(document.path, from);
}
