import { describe, expect, test } from "vitest";

import type { FileTreeNode } from "./fileTypes";
import { sortTreeNodes } from "./fileTreeUtils";

describe("sortTreeNodes", () => {
  test("sorts directories before markdown files", () => {
    const nodes: FileTreeNode[] = [
      { name: "zeta.md", path: "C:\\notes\\zeta.md", kind: "markdown" },
      { name: "alpha", path: "C:\\notes\\alpha", kind: "directory" },
      { name: "beta.md", path: "C:\\notes\\beta.md", kind: "markdown" },
    ];

    const sorted = sortTreeNodes(nodes);

    expect(sorted.map((node) => node.name)).toEqual(["alpha", "beta.md", "zeta.md"]);
  });

  test("compares names case-insensitively within the same kind", () => {
    const nodes: FileTreeNode[] = [
      { name: "Beta.md", path: "C:\\notes\\Beta.md", kind: "markdown" },
      { name: "alpha.md", path: "C:\\notes\\alpha.md", kind: "markdown" },
    ];

    const sorted = sortTreeNodes(nodes);

    expect(sorted.map((node) => node.name)).toEqual(["alpha.md", "Beta.md"]);
  });

  test("sorts children recursively", () => {
    const nodes: FileTreeNode[] = [
      {
        name: "notes",
        path: "C:\\notes",
        kind: "directory",
        children: [
          { name: "welcome.md", path: "C:\\notes\\welcome.md", kind: "markdown" },
          { name: "daily", path: "C:\\notes\\daily", kind: "directory" },
        ],
      },
    ];

    const sorted = sortTreeNodes(nodes);

    expect(sorted[0]?.children?.map((child) => child.name)).toEqual(["daily", "welcome.md"]);
  });

  test("does not mutate the input array", () => {
    const nodes: FileTreeNode[] = [
      { name: "z.md", path: "C:\\notes\\z.md", kind: "markdown" },
      { name: "a", path: "C:\\notes\\a", kind: "directory" },
    ];

    sortTreeNodes(nodes);

    expect(nodes.map((node) => node.name)).toEqual(["z.md", "a"]);
  });
});
