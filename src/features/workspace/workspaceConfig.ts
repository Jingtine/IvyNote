export type MountPermission = "read-write" | "read-only" | "excluded";

export interface MountConfig {
  path: string;
  permission: MountPermission;
  exclusions?: string[];
}

export interface WorkspaceConfig {
  schemaVersion: number;
  id: string;
  name: string;
  mounts: MountConfig[];
  exclusions?: string[];
}

export const DEFAULT_EXCLUSIONS = [
  ".git", "node_modules", "dist", "build", "target",
  ".venv", "venv", ".cache", "coverage",
] as const;
