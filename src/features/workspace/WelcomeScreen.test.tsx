import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";

import type { FileTreeNode } from "../files/fileTypes";
import type { WorkspaceConfig } from "./workspaceConfig";
import {
  addMount as addMountApi,
  createWorkspace as createWorkspaceApi,
  listRecentWorkspaces,
  listWorkspaces,
  openWorkspace as openWorkspaceApi,
  scanRoot,
  stopWatching,
  watchWorkspace,
} from "./workspaceApi";
import { useWorkspaceStore } from "./workspaceStore";
import { WelcomeScreen } from "./WelcomeScreen";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("./workspaceApi", () => ({
  addMount: vi.fn(),
  createWorkspace: vi.fn(),
  openWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  listRecentWorkspaces: vi.fn(),
  scanRoot: vi.fn(),
  stopWatching: vi.fn(),
  watchWorkspace: vi.fn(),
}));

const openMock = vi.mocked(open);
const addMountApiMock = vi.mocked(addMountApi);
const createWorkspaceApiMock = vi.mocked(createWorkspaceApi);
const openWorkspaceApiMock = vi.mocked(openWorkspaceApi);
const listWorkspacesMock = vi.mocked(listWorkspaces);
const listRecentWorkspacesMock = vi.mocked(listRecentWorkspaces);
const scanRootMock = vi.mocked(scanRoot);
const stopWatchingMock = vi.mocked(stopWatching);
const watchWorkspaceMock = vi.mocked(watchWorkspace);

const notesTree: FileTreeNode[] = [{ name: "a.md", path: "C:\\notes\\a.md", kind: "markdown" }];

function makeWorkspace(overrides: Partial<WorkspaceConfig> = {}): WorkspaceConfig {
  return {
    schemaVersion: 1,
    id: "ws-1",
    name: "Personal",
    mounts: [],
    ...overrides,
  };
}

beforeEach(() => {
  openMock.mockReset();
  addMountApiMock.mockReset();
  createWorkspaceApiMock.mockReset();
  openWorkspaceApiMock.mockReset();
  listWorkspacesMock.mockReset();
  listRecentWorkspacesMock.mockReset();
  scanRootMock.mockReset();
  stopWatchingMock.mockReset();
  stopWatchingMock.mockResolvedValue(undefined);
  watchWorkspaceMock.mockReset();
  watchWorkspaceMock.mockResolvedValue(1);
  listWorkspacesMock.mockResolvedValue([]);
  listRecentWorkspacesMock.mockResolvedValue([]);
  useWorkspaceStore.setState({ workspace: null, treeByMount: {}, error: null });
});

test("renders the three entry areas", async () => {
  render(<WelcomeScreen />);

  expect(screen.getByRole("region", { name: "New workspace" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Open workspace" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Recent" })).toBeInTheDocument();
  await waitFor(() => expect(listWorkspacesMock).toHaveBeenCalledTimes(1));
  expect(listRecentWorkspacesMock).toHaveBeenCalledTimes(1);
});

test("New Workspace creates a workspace with the dialog mount path", async () => {
  const user = userEvent.setup();
  openMock.mockResolvedValue("C:\\notes");
  createWorkspaceApiMock.mockResolvedValue(makeWorkspace({ id: "ws-new", name: "Study" }));
  addMountApiMock.mockResolvedValue(
    makeWorkspace({
      id: "ws-new",
      name: "Study",
      mounts: [{ path: "C:\\notes", permission: "read-write" }],
    }),
  );
  scanRootMock.mockResolvedValue(notesTree);
  render(<WelcomeScreen />);

  await user.type(screen.getByLabelText("Workspace name"), "Study");
  await user.click(screen.getByRole("button", { name: "Choose folder" }));
  await user.click(screen.getByRole("button", { name: "Create Workspace" }));

  await waitFor(() => expect(useWorkspaceStore.getState().workspace?.id).toBe("ws-new"));
  expect(openMock).toHaveBeenCalledWith({ directory: true });
  expect(createWorkspaceApiMock).toHaveBeenCalledWith("Study");
  expect(useWorkspaceStore.getState().workspace?.name).toBe("Study");
  expect(useWorkspaceStore.getState().workspace?.mounts).toEqual([
    { path: "C:\\notes", permission: "read-write" },
  ]);
  expect(useWorkspaceStore.getState().treeByMount["C:\\notes"]).toEqual(notesTree);
});

test("Create Workspace stays disabled until a name and folder are chosen", async () => {
  const user = userEvent.setup();
  openMock.mockResolvedValue("C:\\notes");
  render(<WelcomeScreen />);

  const createButton = screen.getByRole("button", { name: "Create Workspace" });
  expect(createButton).toBeDisabled();

  await user.type(screen.getByLabelText("Workspace name"), "Study");
  expect(createButton).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Choose folder" }));
  expect(createButton).toBeEnabled();
});

test("lists existing workspaces and opens one with a click", async () => {
  const user = userEvent.setup();
  const personal = makeWorkspace({ id: "ws-1", name: "Personal" });
  const wiki = makeWorkspace({ id: "ws-2", name: "Wiki" });
  listWorkspacesMock.mockResolvedValue([personal, wiki]);
  openWorkspaceApiMock.mockResolvedValue({
    ...personal,
    mounts: [{ path: "C:\\notes", permission: "read-write" }],
  });
  scanRootMock.mockResolvedValue(notesTree);
  render(<WelcomeScreen />);

  const openSection = await screen.findByRole("region", { name: "Open workspace" });
  await waitFor(() =>
    expect(within(openSection).getByRole("button", { name: "Personal" })).toBeInTheDocument(),
  );

  await user.click(within(openSection).getByRole("button", { name: "Personal" }));

  await waitFor(() => expect(useWorkspaceStore.getState().workspace?.id).toBe("ws-1"));
  expect(openWorkspaceApiMock).toHaveBeenCalledWith("ws-1");
});

test("lists recent workspaces in recency order and opens one with a click", async () => {
  const user = userEvent.setup();
  const personal = makeWorkspace({ id: "ws-1", name: "Personal" });
  const wiki = makeWorkspace({ id: "ws-2", name: "Wiki" });
  listWorkspacesMock.mockResolvedValue([personal, wiki]);
  listRecentWorkspacesMock.mockResolvedValue(["ws-2", "ws-1"]);
  openWorkspaceApiMock.mockResolvedValue({
    ...wiki,
    mounts: [{ path: "C:\\wiki", permission: "read-write" }],
  });
  scanRootMock.mockResolvedValue(notesTree);
  render(<WelcomeScreen />);

  const recentSection = await screen.findByRole("region", { name: "Recent" });
  await waitFor(() =>
    expect(within(recentSection).getByRole("button", { name: "Wiki" })).toBeInTheDocument(),
  );
  const recentButtons = within(recentSection).getAllByRole("button");
  expect(recentButtons.map((button) => button.textContent)).toEqual(["Wiki", "Personal"]);

  await user.click(within(recentSection).getByRole("button", { name: "Wiki" }));

  await waitFor(() => expect(useWorkspaceStore.getState().workspace?.id).toBe("ws-2"));
  expect(openWorkspaceApiMock).toHaveBeenCalledWith("ws-2");
});

test("skips recent ids that no longer exist in the workspace list", async () => {
  const personal = makeWorkspace({ id: "ws-1", name: "Personal" });
  listWorkspacesMock.mockResolvedValue([personal]);
  listRecentWorkspacesMock.mockResolvedValue(["ws-1", "ws-deleted"]);
  render(<WelcomeScreen />);

  const recentSection = await screen.findByRole("region", { name: "Recent" });
  await waitFor(() =>
    expect(within(recentSection).getByRole("button", { name: "Personal" })).toBeInTheDocument(),
  );
  expect(within(recentSection).getAllByRole("button")).toHaveLength(1);
});

