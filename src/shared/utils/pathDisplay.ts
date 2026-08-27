export function shortenRootPath(rootPath: string, maxLength = 32): string {
  if (rootPath.length <= maxLength) return rootPath;
  const separator = rootPath.includes("\\") ? "\\" : "/";
  const segments = rootPath.split(/[\\/]/);
  const tail: string[] = [];
  let tailLength = 0;
  for (let i = segments.length - 1; i > 0; i -= 1) {
    const segment = segments[i];
    if (segment === "") continue;
    const candidateLength =
      tail.length === 0 ? segment.length : tailLength + separator.length + segment.length;
    if (candidateLength + 1 > maxLength) break;
    tail.unshift(segment);
    tailLength = candidateLength;
  }
  if (tail.length === 0) {
    return "…" + rootPath.slice(-(maxLength - 1));
  }
  return "…" + separator + tail.join(separator);
}
