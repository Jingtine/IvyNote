import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import type { WorkspaceConfig } from "./workspaceConfig";
import { listRecentWorkspaces, listWorkspaces } from "./workspaceApi";
import { useWorkspaceStore } from "./workspaceStore";

export function WelcomeScreen() {
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
  const openWorkspace = useWorkspaceStore((state) => state.openWorkspace);
  const workspaceError = useWorkspaceStore((state) => state.error);

  const [name, setName] = useState("");
  const [initialMountPath, setInitialMountPath] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceConfig[]>([]);
  const [recent, setRecent] = useState<WorkspaceConfig[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [all, recentIds] = await Promise.all([listWorkspaces(), listRecentWorkspaces()]);
        if (cancelled) return;
        const byId = new Map(all.map((workspace) => [workspace.id, workspace]));
        setWorkspaces(all);
        setRecent(
          recentIds
            .map((id) => byId.get(id))
            .filter((workspace): workspace is WorkspaceConfig => workspace !== undefined),
        );
      } catch {
        if (!cancelled) {
          setWorkspaces([]);
          setRecent([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canCreate = name.trim() !== "" && initialMountPath !== null;

  const handleChooseFolder = async () => {
    const selected = await open({ directory: true });
    if (selected !== null) {
      setInitialMountPath(selected);
    }
  };

  const handleCreate = () => {
    if (initialMountPath === null) return;
    void createWorkspace(name.trim(), initialMountPath);
  };

  return (
    <div className="welcome">
      <h1>Local Knowledge IDE</h1>
      <p className="welcome__subtitle">
        No workspace selected. Create a new workspace or open an existing one.
      </p>
      <section aria-label="New workspace" className="welcome__new-workspace">
        <h2>New Workspace</h2>
        <div className="welcome__field">
          <label htmlFor="workspace-name">Workspace name</label>
          <input
            id="workspace-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Personal Knowledge"
          />
        </div>
        <div className="welcome__field">
          <button type="button" onClick={() => void handleChooseFolder()}>
            {initialMountPath === null ? "Choose folder" : "Change folder"}
          </button>
          {initialMountPath !== null && (
            <span aria-label="Selected mount path">{initialMountPath}</span>
          )}
        </div>
        <button type="button" onClick={handleCreate} disabled={!canCreate}>
          Create Workspace
        </button>
      </section>
      <section aria-label="Open workspace" className="welcome__open-workspace">
        <h2>Open Workspace</h2>
        {workspaces.length === 0 ? (
          <p>No workspaces yet. Create one above.</p>
        ) : (
          <ul>
            {workspaces.map((workspace) => (
              <li key={workspace.id}>
                <button type="button" onClick={() => void openWorkspace(workspace.id)}>
                  {workspace.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Recent" className="welcome__recent">
        <h2>Recent</h2>
        {recent.length === 0 ? (
          <p>No recently opened workspaces.</p>
        ) : (
          <ul>
            {recent.map((workspace) => (
              <li key={workspace.id}>
                <button type="button" onClick={() => void openWorkspace(workspace.id)}>
                  {workspace.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {workspaceError !== null && (
        <p role="alert" className="welcome__error">
          {workspaceError}
        </p>
      )}
    </div>
  );
}
