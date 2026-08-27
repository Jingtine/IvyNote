import { open } from "@tauri-apps/plugin-dialog";

import { shortenRootPath } from "../../shared/utils/pathDisplay";
import type { MountPermission } from "./workspaceConfig";
import { useWorkspaceStore } from "./workspaceStore";

const PERMISSION_OPTIONS: MountPermission[] = ["read-write", "read-only", "excluded"];

interface MountManagerProps {
  onRemoveMount: (path: string) => void;
}

export function MountManager({ onRemoveMount }: MountManagerProps) {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const addMount = useWorkspaceStore((state) => state.addMount);
  const setMountPermission = useWorkspaceStore((state) => state.setMountPermission);

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

  return (
    <aside aria-label="Mount manager" className="mount-manager">
      <h2>Mounts</h2>
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
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => void handleAddMount()}>
        Add mount
      </button>
    </aside>
  );
}
