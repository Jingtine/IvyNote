import type {
  FileTreeNode,
  NewlineStyle,
  SaveTextDocumentRequest,
  SaveTextDocumentResult,
  TextDocumentSnapshot,
} from "./fileTypes";

test("file DTO samples match the locked contract shapes", () => {
  const node: FileTreeNode = {
    name: "notes",
    path: "notes",
    kind: "directory",
    children: [{ name: "a.md", path: "notes/a.md", kind: "markdown" }],
  };
  const snapshot: TextDocumentSnapshot = {
    path: "notes/a.md",
    content: "# Hello",
    modifiedAtMs: 1_700_000_000_000,
    size: 7,
    newline: "crlf",
    hasUtf8Bom: true,
  };
  const request: SaveTextDocumentRequest = {
    path: "notes/a.md",
    content: "# Updated",
    expectedModifiedAtMs: 1234,
    expectedSize: 9,
    newline: "lf",
    hasUtf8Bom: false,
  };
  const result: SaveTextDocumentResult = { modifiedAtMs: 42, size: 99 };
  const newline: NewlineStyle = "lf";

  expect(node.children?.[0].kind).toBe("markdown");
  expect(snapshot.hasUtf8Bom).toBe(true);
  expect(snapshot.newline).toBe("crlf");
  expect(request.expectedModifiedAtMs).toBe(1234);
  expect(result.size).toBe(99);
  expect(newline).toBe("lf");
});
