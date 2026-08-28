import { beforeEach, expect, test, vi } from "vitest";
import { listen } from "@tauri-apps/api/event";

import type { EditorState } from "../editor/editorStore";
import { useEditorStore } from "../editor/editorStore";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { dispatchWatcherEvent, subscribeToWatcherEvents } from "./watcherBridge";
import type { WatcherEvent } from "./watcherTypes";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("../workspace/workspaceStore", () => ({
  useWorkspaceStore: { getState: vi.fn() },
}));

vi.mock("../editor/editorStore", () => ({
  useEditorStore: { getState: vi.fn() },
}));

const listenMock = vi.mocked(listen);
const workspaceGetState = vi.mocked(useWorkspaceStore.getState);
const editorGetState = vi.mocked(useEditorStore.getState);

const ACTIVE_PATH = "C:\\notes\\active.md";

interface EditorActions {
  document: { path: string } | null;
  setFileMissing: ReturnType<typeof vi.fn>;
  handleWatcherRename: ReturnType<typeof vi.fn>;
}

function editorState(overrides: Partial<EditorActions> = {}): EditorActions {
  return {
    document: { path: ACTIVE_PATH },
    setFileMissing: vi.fn(),
    handleWatcherRename: vi.fn(),
    ...overrides,
  };
}

function workspaceState(refreshTree: ReturnType<typeof vi.fn>) {
  return { refreshTree } as unknown as ReturnType<typeof useWorkspaceStore.getState>;
}

function editorStateAsStore(state: EditorActions) {
  return state as unknown as EditorState;
}

beforeEach(() => {
  listenMock.mockReset();
  workspaceGetState.mockReset();
  editorGetState.mockReset();
});

test("a created event triggers a workspace tree refresh", () => {
  const refreshTree = vi.fn();
  workspaceGetState.mockReturnValue(workspaceState(refreshTree));

  dispatchWatcherEvent({ kind: "created", path: "C:\\notes\\new.md" });

  expect(refreshTree).toHaveBeenCalledTimes(1);
});

test("a removed event outside the active document refreshes the tree without touching the editor", () => {
  const refreshTree = vi.fn();
  const state = editorState();
  editorGetState.mockReturnValue(editorStateAsStore(state));
  workspaceGetState.mockReturnValue(workspaceState(refreshTree));

  dispatchWatcherEvent({ kind: "removed", path: "C:\\notes\\other.md" });

  expect(refreshTree).toHaveBeenCalledTimes(1);
  expect(state.setFileMissing).not.toHaveBeenCalled();
});

test("a removed event on the active document sets fileMissing", () => {
  const refreshTree = vi.fn();
  const state = editorState();
  editorGetState.mockReturnValue(editorStateAsStore(state));
  workspaceGetState.mockReturnValue(workspaceState(refreshTree));

  dispatchWatcherEvent({ kind: "removed", path: ACTIVE_PATH });

  expect(state.setFileMissing).toHaveBeenCalledWith(true);
  expect(refreshTree).toHaveBeenCalledTimes(1);
});

test("a renamed event where from matches the active document triggers the editor follow action", () => {
  const refreshTree = vi.fn();
  const state = editorState();
  editorGetState.mockReturnValue(editorStateAsStore(state));
  workspaceGetState.mockReturnValue(workspaceState(refreshTree));

  dispatchWatcherEvent({ kind: "renamed", from: ACTIVE_PATH, to: "C:\\notes\\renamed.md" });

  expect(state.handleWatcherRename).toHaveBeenCalledWith(
    ACTIVE_PATH,
    "C:\\notes\\renamed.md",
  );
});

test("a renamed event that does not match the active document leaves the editor alone", () => {
  const refreshTree = vi.fn();
  const state = editorState();
  editorGetState.mockReturnValue(editorStateAsStore(state));
  workspaceGetState.mockReturnValue(workspaceState(refreshTree));

  dispatchWatcherEvent({ kind: "renamed", from: "C:\\notes\\other.md", to: "C:\\notes\\moved.md" });

  expect(state.handleWatcherRename).not.toHaveBeenCalled();
  expect(state.setFileMissing).not.toHaveBeenCalled();
});

test("subscribeToWatcherEvents listens on watcher://event and dispatches the payload", async () => {
  let handler: ((event: { payload: WatcherEvent }) => void) | undefined;
  listenMock.mockImplementation((_event, callback) => {
    handler = callback as unknown as (event: { payload: WatcherEvent }) => void;
    return Promise.resolve(() => {});
  });

  await subscribeToWatcherEvents();

  expect(listenMock).toHaveBeenCalledWith("watcher://event", expect.any(Function));

  const refreshTree = vi.fn();
  workspaceGetState.mockReturnValue(workspaceState(refreshTree));
  handler?.({ payload: { kind: "created", path: "C:\\notes\\x.md" } });

  expect(refreshTree).toHaveBeenCalledTimes(1);
});
