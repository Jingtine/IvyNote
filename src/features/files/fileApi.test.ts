import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, test, vi } from "vitest";

import type { SaveTextDocumentRequest, TextDocumentSnapshot } from "./fileTypes";
import {
  createFolder,
  createMarkdown,
  deleteToTrash,
  movePath,
  readMarkdownFile,
  renamePath,
  saveMarkdownDocument,
} from "./fileApi";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
});

test("readMarkdownFile invokes read_markdown_file with the path argument shape", async () => {
  const snapshot: TextDocumentSnapshot = {
    path: "C:\\notes\\hello.md",
    content: "# Hello\n",
    modifiedAtMs: 1_700_000_000_000,
    size: 9,
    newline: "lf",
    hasUtf8Bom: false,
  };
  invokeMock.mockResolvedValue(snapshot);

  const result = await readMarkdownFile("C:\\notes\\hello.md");

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("read_markdown_file", {
    path: "C:\\notes\\hello.md",
  });
  expect(result).toEqual(snapshot);
});

test("readMarkdownFile propagates invoke errors", async () => {
  invokeMock.mockRejectedValue(new Error("boom"));

  await expect(readMarkdownFile("C:\\missing.md")).rejects.toThrow("boom");
  expect(invokeMock).toHaveBeenCalledWith("read_markdown_file", {
    path: "C:\\missing.md",
  });
});

test("saveMarkdownDocument invokes save_markdown_file with the request argument shape", async () => {
  const request: SaveTextDocumentRequest = {
    path: "C:\\notes\\hello.md",
    content: "# Hello\nEdited\n",
    expectedModifiedAtMs: 1_700_000_000_000,
    expectedSize: 9,
    newline: "lf",
    hasUtf8Bom: false,
  };
  invokeMock.mockResolvedValue({ modifiedAtMs: 1_700_000_000_500, size: 16 });

  const result = await saveMarkdownDocument(request);

  expect(invokeMock).toHaveBeenCalledTimes(1);
  expect(invokeMock).toHaveBeenCalledWith("save_markdown_file", { request });
  expect(result).toEqual({ modifiedAtMs: 1_700_000_000_500, size: 16 });
});

test("saveMarkdownDocument propagates invoke errors", async () => {
  invokeMock.mockRejectedValue(new Error("conflict"));

  await expect(
    saveMarkdownDocument({
      path: "C:\\notes\\hello.md",
      content: "# Hello\n",
      expectedModifiedAtMs: 1,
      expectedSize: 1,
      newline: "lf",
      hasUtf8Bom: false,
    }),
  ).rejects.toThrow("conflict");
});

test("createFolder invokes create_folder with workspaceId/parent/name keys", async () => {
  invokeMock.mockResolvedValue("C:\\notes\\new folder");

  const result = await createFolder("ws-1", "C:\\notes", "new folder");

  expect(invokeMock).toHaveBeenCalledWith("create_folder", {
    workspaceId: "ws-1",
    parent: "C:\\notes",
    name: "new folder",
  });
  expect(result).toBe("C:\\notes\\new folder");
});

test("createFolder surfaces permissionDenied rejections", async () => {
  invokeMock.mockRejectedValue({
    code: "permissionDenied",
    message: "Permission denied: C:\\notes",
  });

  await expect(createFolder("ws-1", "C:\\notes", "x")).rejects.toMatchObject({
    code: "permissionDenied",
  });
});

test("createMarkdown invokes create_markdown with workspaceId/parent/name keys", async () => {
  invokeMock.mockResolvedValue("C:\\notes\\note.md");

  const result = await createMarkdown("ws-1", "C:\\notes", "note.md");

  expect(invokeMock).toHaveBeenCalledWith("create_markdown", {
    workspaceId: "ws-1",
    parent: "C:\\notes",
    name: "note.md",
  });
  expect(result).toBe("C:\\notes\\note.md");
});

test("renamePath invokes rename_path with workspaceId/path/newName keys", async () => {
  invokeMock.mockResolvedValue("C:\\notes\\renamed.md");

  const result = await renamePath("ws-1", "C:\\notes\\old.md", "renamed.md");

  expect(invokeMock).toHaveBeenCalledWith("rename_path", {
    workspaceId: "ws-1",
    path: "C:\\notes\\old.md",
    newName: "renamed.md",
  });
  expect(result).toBe("C:\\notes\\renamed.md");
});

test("movePath invokes move_path with workspaceId/path/targetDir keys", async () => {
  invokeMock.mockResolvedValue("C:\\notes\\sub\\note.md");

  const result = await movePath("ws-1", "C:\\notes\\note.md", "C:\\notes\\sub");

  expect(invokeMock).toHaveBeenCalledWith("move_path", {
    workspaceId: "ws-1",
    path: "C:\\notes\\note.md",
    targetDir: "C:\\notes\\sub",
  });
  expect(result).toBe("C:\\notes\\sub\\note.md");
});

test("movePath surfaces crossMountMoveNotAllowed rejections", async () => {
  invokeMock.mockRejectedValue({
    code: "crossMountMoveNotAllowed",
    message: "Cannot move across mounts: C:\\a\\note.md",
  });

  await expect(
    movePath("ws-1", "C:\\a\\note.md", "D:\\b"),
  ).rejects.toMatchObject({ code: "crossMountMoveNotAllowed" });
});

test("deleteToTrash invokes delete_to_trash with workspaceId/path keys", async () => {
  invokeMock.mockResolvedValue(undefined);

  await deleteToTrash("ws-1", "C:\\notes\\stale.md");

  expect(invokeMock).toHaveBeenCalledWith("delete_to_trash", {
    workspaceId: "ws-1",
    path: "C:\\notes\\stale.md",
  });
});
