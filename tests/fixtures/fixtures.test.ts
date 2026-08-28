import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const FIXTURES = join(import.meta.dirname);

function readBytes(relative: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, relative)));
}

function collectMdPaths(dir: string): string[] {
  const out: string[] = [];
  const base = join(FIXTURES, dir);
  const walk = (abs: string, rel: string) => {
    for (const entry of readdirSync(abs)) {
      const childAbs = join(abs, entry);
      const childRel = join(rel, entry);
      if (statSync(childAbs).isDirectory()) {
        walk(childAbs, childRel);
      } else if (entry.endsWith(".md")) {
        out.push(childRel.replaceAll("\\", "/"));
      }
    }
  };
  walk(base, "");
  return out;
}

test("crlf.md is physically committed with CRLF line endings", () => {
  const bytes = readBytes("crlf/crlf.md");
  const text = new TextDecoder().decode(bytes);

  expect(text).toContain("\r\n");
  expect(text.split("\r\n").length).toBeGreaterThan(2);
  expect(text.replaceAll("\r\n", "")).not.toContain("\n");
});

test("bom.md physically starts with a UTF-8 BOM (EF BB BF)", () => {
  const bytes = readBytes("utf8-bom/bom.md");
  expect(bytes[0]).toBe(0xef);
  expect(bytes[1]).toBe(0xbb);
  expect(bytes[2]).toBe(0xbf);
  expect(new TextDecoder().decode(bytes.slice(3))).toMatch(/^# BOM Preservation/);
});

test("simple fixture tree exposes only the expected Markdown files", () => {
  expect(collectMdPaths("simple").sort()).toEqual([
    "Notes/hello.md",
    "README.md",
  ]);
  expect(readBytes("simple/ignored.txt").length).toBeGreaterThan(0);
  expect(statSync(join(FIXTURES, "simple/Notes/hello.md")).isFile()).toBe(true);
});

test("multi fixture tree exposes two mounts, each with a nested note and a tmp dir", () => {
  expect(collectMdPaths("multi").sort()).toEqual([
    "README.md",
    "notes/Projects/project-a.md",
    "notes/README.md",
    "notes/tmp/scratch.md",
    "wiki/Reference/glossary.md",
    "wiki/index.md",
    "wiki/tmp/sandbox.md",
  ]);
  expect(statSync(join(FIXTURES, "multi/notes/tmp/scratch.md")).isFile()).toBe(true);
  expect(statSync(join(FIXTURES, "multi/wiki/tmp/sandbox.md")).isFile()).toBe(true);
});
