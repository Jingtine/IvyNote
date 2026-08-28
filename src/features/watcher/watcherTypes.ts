export type WatcherEvent =
  | { kind: "created"; path: string }
  | { kind: "removed"; path: string }
  | { kind: "renamed"; from: string; to: string };
