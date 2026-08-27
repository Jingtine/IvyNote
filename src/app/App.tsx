import { WorkspacePicker } from "../features/workspace/WorkspacePicker";
import { useWorkspaceStore } from "../features/workspace/workspaceStore";

export function App() {
  const rootPath = useWorkspaceStore((state) => state.rootPath);

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
      <aside aria-label="File explorer" />
      <section aria-label="Editor" />
    </main>
  );
}
