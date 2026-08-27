import { useWorkspaceStore } from "./workspaceStore";

export function WorkspacePicker() {
  const rootPath = useWorkspaceStore((state) => state.rootPath);
  const openRoot = useWorkspaceStore((state) => state.openRoot);

  return (
    <div>
      <button type="button" onClick={() => void openRoot()}>
        Open Folder
      </button>
      {rootPath !== null ? <p aria-label="Selected root path">{rootPath}</p> : null}
    </div>
  );
}
