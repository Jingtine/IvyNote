import { open } from "@tauri-apps/plugin-dialog";

import { shortenRootPath } from "../../shared/utils/pathDisplay";
import type { MountPermission } from "./workspaceConfig";
import { DEFAULT_EXCLUSIONS } from "./workspaceConfig";
import { effectiveExclusions, useWorkspaceStore } from "./workspaceStore";

const PERMISSION_OPTIONS: MountPermission[] = ["read-write", "read-only", "excluded"];

function parseExclusions(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

interface MountManagerProps {
  onRemoveMount: (path: string) => void;
}

export function MountManager({ onRemoveMount }: MountManagerProps) {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const addMount = useWorkspaceStore((state) => state.addMount);
  const setMountPermission = useWorkspaceStore((state) => state.setMountPermission);
  const updateMountExclusions = useWorkspaceStore((state) => state.updateMountExclusions);
  const updateWorkspaceExclusions = useWorkspaceStore((state) => state.updateWorkspaceExclusions);

  const mounts = workspace === null ? [] : workspace.mounts;

  const handleAddMount = async () => {
    const selected = await open({ directory: true });
    if (selected !== null) {
      void addMount(selected, "read-write");
    }
  };

  const handlePermissionChange = (path: string, value: string) => {
    void setMountPermission(path, value as MountPermission);
  };

  const handleSaveWorkspaceExclusions = (value: string) => {
    void updateWorkspaceExclusions(parseExclusions(value));
  };

  const handleSaveMountExclusions = (path: string, value: string) => {
    void updateMountExclusions(path, parseExclusions(value));
  };

  return (
    <aside aria-label="Mount manager" className="mount-manager">
      <h2>Mounts</h2>
      {workspace !== null && (
        <form
          className="mount-manager__workspace-exclusions"
          onSubmit={(event) => {
            event.preventDefault();
            const value = new FormData(event.currentTarget).get("exclusions");
            handleSaveWorkspaceExclusions(typeof value === "string" ? value : "");
          }}
        >
          <h3>Default exclusions</h3>
          <p className="mount-manager__hint">
            Applied to every mount that does not set its own override.
          </p>
          <input
            name="exclusions"
            aria-label="Workspace default exclusions"
            defaultValue={(workspace.exclusions ?? [...DEFAULT_EXCLUSIONS]).join(", ")}
          />
          <button type="submit">Save default exclusions</button>
        </form>
      )}
      <ul className="mount-manager__list">
        {mounts.map((mount) => (
          <li key={mount.path} className="mount-manager__mount">
            <span className="mount-manager__path" title={mount.path}>
              {shortenRootPath(mount.path)}
            </span>
            <select
              aria-label={`Permission for ${mount.path}`}
              value={mount.permission}
              onChange={(event) => handlePermissionChange(mount.path, event.target.value)}
            >
              {PERMISSION_OPTIONS.map((permission) => (
                <option key={permission} value={permission}>
                  {permission}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={`Remove ${mount.path}`}
              onClick={() => onRemoveMount(mount.path)}
            >
              Remove
            </button>
            {workspace !== null && (
              <form
                className="mount-manager__exclusions"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = new FormData(event.currentTarget).get("exclusions");
                  handleSaveMountExclusions(mount.path, typeof value === "string" ? value : "");
                }}
              >
                <label htmlFor={`exclusions-${mount.path}`}>Exclusions (override)</label>
                <input
                  id={`exclusions-${mount.path}`}
                  name="exclusions"
                  aria-label={`Exclusions for ${mount.path}`}
                  defaultValue={mount.exclusions?.join(", ") ?? ""}
                  placeholder="Inherit workspace default"
                />
                <button type="submit" aria-label={`Save exclusions for ${mount.path}`}>
                  Save
                </button>
                <p className="mount-manager__effective">
                  Effective: {effectiveExclusions(workspace, mount).join(", ")}
                </p>
              </form>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => void handleAddMount()}>
        Add mount
      </button>
    </aside>
  );
}
