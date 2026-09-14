import { describe, expect, test } from "vitest";

import {
  DEFAULT_EXCLUSIONS,
  type MountConfig,
  type MountPermission,
  type WorkspaceConfig,
} from "./workspaceConfig";

describe("workspace config mirror", () => {
  test("parses Rust camelCase/kebab-case JSON into the TS types", () => {
    const raw = `{
      "schemaVersion": 1,
      "id": "abc",
      "name": "Personal",
      "mounts": [
        { "path": "D:\\\\Notes", "permission": "read-only", "exclusions": ["tmp"] }
      ],
      "exclusions": [".git", "node_modules"]
    }`;
    const config = JSON.parse(raw) as WorkspaceConfig;
    expect(config.schemaVersion).toBe(1);
    expect(config.id).toBe("abc");
    expect(config.name).toBe("Personal");
    expect(config.mounts[0].path).toBe("D:\\Notes");
    expect(config.mounts[0].permission).toBe("read-only");
    expect(config.mounts[0].exclusions).toEqual(["tmp"]);
    expect(config.exclusions).toEqual([".git", "node_modules"]);
  });

  test("accepts every kebab-case permission and empty config with omitted exclusions", () => {
    const permissions: MountPermission[] = ["read-write", "read-only", "excluded"];
    for (const permission of permissions) {
      const mount: MountConfig = { path: "C:\\x", permission };
      expect(mount.permission).toBe(permission);
    }

    const minimal = JSON.parse(
      `{ "schemaVersion": 1, "id": "min", "name": "Min", "mounts": [] }`,
    ) as WorkspaceConfig;
    expect(minimal.mounts).toEqual([]);
    expect(minimal.exclusions).toBeUndefined();
  });

  test("DEFAULT_EXCLUSIONS matches the Rust constant", () => {
    expect([...DEFAULT_EXCLUSIONS]).toEqual([
      ".git", "node_modules", "dist", "build", "target",
      ".venv", "venv", ".cache", "coverage",
    ]);
  });
});
