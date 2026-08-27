import "@testing-library/jest-dom/vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, expect, test, vi } from "vitest";

import { MarkdownSourceEditor } from "./MarkdownSourceEditor";

beforeAll(() => {
  // jsdom does not implement Range#getClientRects; CodeMirror's measure pass calls it.
  if (typeof Range.prototype.getClientRects !== "function") {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  }
});

test("renders the markdown source text in the DOM", () => {
  render(<MarkdownSourceEditor value="# Hello IvyNote" onChange={vi.fn()} />);

  const content = document.querySelector(".cm-content");

  expect(content).not.toBeNull();
  expect(content?.textContent).toContain("# Hello IvyNote");
});

test("typing in the editor emits onChange with the updated value", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<MarkdownSourceEditor value="start" onChange={onChange} />);

  const content = document.querySelector(".cm-content") as HTMLElement;
  content.focus();
  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  await user.keyboard("!");

  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.calls.at(-1)?.[0]).toBe("start!");
});

test("re-renders when the controlled value changes", () => {
  const { rerender } = render(<MarkdownSourceEditor value="first" onChange={vi.fn()} />);

  expect(document.querySelector(".cm-content")?.textContent).toContain("first");

  rerender(<MarkdownSourceEditor value="second draft" onChange={vi.fn()} />);

  expect(document.querySelector(".cm-content")?.textContent).toContain("second draft");
});
