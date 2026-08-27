import { FileTree } from "../features/files/FileTree";
import { WorkspacePicker } from "../features/workspace/WorkspacePicker";
import { useWorkspaceStore } from "../features/workspace/workspaceStore";

export function App() {
  const rootPath = useWorkspaceStore((state) => state.rootPath);
  const tree = useWorkspaceStore((state) => state.tree);

  const handleOpenMarkdown: (path: string) => void = () => {};

  if (rootPath === null) {
    return (
      <main role="application" aria-label="Local Knowledge IDE">
        <section aria-label="Welcome">
          <h1>Local Knowledge IDE</h1>
          <p>Open a local folder to begin</p>
          <WorkspacePicker />
        </section>
      </main>
    );
  }

  return (
    <main role="application" aria-label="Local Knowledge IDE">
      <header aria-label="Workspace header">
        <WorkspacePicker />
      </header>
      <aside aria-label="File explorer">
        <FileTree tree={tree} rootPath={rootPath} onOpenMarkdown={handleOpenMarkdown} />
      </aside>
      <section aria-label="Editor" />
    </main>
  );
}
