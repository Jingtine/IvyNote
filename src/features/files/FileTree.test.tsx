import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import type { FileTreeNode } from "./fileTypes";
import { FileTree } from "./FileTree";

const tree: FileTreeNode[] = [
  {
    name: "notes",
    path: "C:\\workspace\\notes",
    kind: "directory",
    children: [
      {
        name: "daily",
        path: "C:\\workspace\\notes\\daily",
        kind: "directory",
        children: [
          {
            name: "2026-01-01.md",
            path: "C:\\workspace\\notes\\daily\\2026-01-01.md",
            kind: "markdown",
          },
        ],
      },
      { name: "intro.md", path: "C:\\workspace\\notes\\intro.md", kind: "markdown" },
    ],
  },
  { name: "scratch.md", path: "C:\\workspace\\scratch.md", kind: "markdown" },
];

function renderTree(onOpenMarkdown = vi.fn()) {
  render(<FileTree tree={tree} onOpenMarkdown={onOpenMarkdown} />);
  return onOpenMarkdown;
}

test("renders nested directories once expanded", async () => {
  const user = userEvent.setup();
  renderTree();

  await user.click(screen.getByRole("treeitem", { name: "notes" }));

  expect(screen.getByRole("treeitem", { name: "daily" })).toBeInTheDocument();

  await user.click(screen.getByRole("treeitem", { name: "daily" }));

  expect(screen.getByRole("treeitem", { name: "2026-01-01.md" })).toBeInTheDocument();
});

test("renders markdown files as tree items", () => {
  renderTree();

  expect(screen.getByRole("treeitem", { name: "scratch.md" })).toBeInTheDocument();
});

test("expands and collapses directories on click", async () => {
  const user = userEvent.setup();
  renderTree();

  const notes = screen.getByRole("treeitem", { name: "notes" });

  expect(notes).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("treeitem", { name: "intro.md" })).not.toBeInTheDocument();

  await user.click(notes);

  expect(notes).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("treeitem", { name: "intro.md" })).toBeInTheDocument();

  await user.click(notes);

  expect(notes).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("treeitem", { name: "intro.md" })).not.toBeInTheDocument();
});

test("clicking a markdown file emits its exact full path", async () => {
  const user = userEvent.setup();
  const onOpenMarkdown = renderTree();

  await user.click(screen.getByRole("treeitem", { name: "scratch.md" }));

  expect(onOpenMarkdown).toHaveBeenCalledTimes(1);
  expect(onOpenMarkdown).toHaveBeenCalledWith("C:\\workspace\\scratch.md");
});

test("clicking a directory does not emit the file-open callback", async () => {
  const user = userEvent.setup();
  const onOpenMarkdown = renderTree();

  await user.click(screen.getByRole("treeitem", { name: "notes" }));

  expect(onOpenMarkdown).not.toHaveBeenCalled();
});

test("Enter key toggles a directory and opens a file", async () => {
  const user = userEvent.setup();
  const onOpenMarkdown = renderTree();

  const notes = screen.getByRole("treeitem", { name: "notes" });
  notes.focus();
  await user.keyboard("{Enter}");

  expect(notes).toHaveAttribute("aria-expanded", "true");
  expect(onOpenMarkdown).not.toHaveBeenCalled();

  const intro = screen.getByRole("treeitem", { name: "intro.md" });
  intro.focus();
  await user.keyboard("{Enter}");

  expect(onOpenMarkdown).toHaveBeenCalledTimes(1);
  expect(onOpenMarkdown).toHaveBeenCalledWith("C:\\workspace\\notes\\intro.md");
});

test("shows a shortened root path while keeping the full path accessible", () => {
  render(
    <FileTree
      tree={tree}
      rootPath="C:\Users\LJT\Documents\SomeVeryLongFolderName\Notes"
      onOpenMarkdown={vi.fn()}
    />,
  );

  const rootLabel = screen.getByTitle("C:\\Users\\LJT\\Documents\\SomeVeryLongFolderName\\Notes");

  expect(rootLabel).toHaveTextContent("…");
  expect(rootLabel.textContent).not.toBe("C:\\Users\\LJT\\Documents\\SomeVeryLongFolderName\\Notes");
});
