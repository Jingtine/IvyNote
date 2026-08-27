import { useWorkspaceStore } from "./workspaceStore";

export function WorkspacePicker() {
  const workspace = useWorkspaceStore((state) => state.workspace);
  const switchToWelcome = useWorkspaceStore((state) => state.switchToWelcome);

  return (
    <div>
      <button type="button" onClick={() => switchToWelcome()}>
        Switch Workspace
      </button>
      {workspace !== null ? <p aria-label="Selected workspace">{workspace.name}</p> : null}
    </div>
  );
}
