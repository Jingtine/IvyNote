/**
 * Remaps `path` when `from` is an ancestor-or-equal path prefix of it,
 * substituting `to` for that prefix. Matching is component-boundary aware so a
 * sibling like `C:\notes2` never matches `C:\notes`. Returns null when `from`
 * is not a path-component prefix of `path`.
 */
export function remapPathPrefix(path: string, from: string, to: string): string | null {
  if (path === from) return to;
  for (const separator of ["\\", "/"]) {
    if (path.startsWith(from + separator)) {
      return to + separator + path.slice(from.length + separator.length);
    }
  }
  return null;
}

/** True when `ancestor` is an ancestor-or-equal path prefix of `path`. */
export function isPathWithinOrEqual(path: string, ancestor: string): boolean {
  return remapPathPrefix(path, ancestor, ancestor) !== null;
}
