# ADR 0003: Workspace Config Lives in AppData, Versioned

Date: 2026-08-28

Status: Accepted (v0.2)

## Context

v0.1 had exactly one root directory per session and no persistence. v0.2 introduces named multi-mount Workspaces — each Workspace composes several existing local directories ("mounts") with per-mount permissions and exclusion rules. That configuration must persist between launches and be re-openable. Two constraints drive the storage choice:

- Spec §6.4: Workspace config must live in the OS App Data directory of the application, never inside the user's knowledge directories, and the user's knowledge data must never depend on the config to be readable.
- Spec §44: configs must carry a schema version, and any migration must detect the old version, back up, migrate, validate, and switch — never silently rewrite.
- No database yet: SQLite/indexing is deliberately deferred to v0.7, so this milestone must not introduce a DB dependency.

## Decision

1. **One versioned JSON file per Workspace** at `<AppData>/<app>/workspaces/<id>.json`:

   - `<AppData>` is `dirs::data_dir()` (Windows: `%APPDATA%`, macOS: `~/Library/Application Support`).
   - `<app>` is the Tauri bundle identifier, `com.local-knowledge-ide.app` (`src-tauri/tauri.conf.json`). The command layer resolves `<AppData>/<app>` via the `app_data_dir` helper (`src-tauri/src/commands/workspace.rs:22`) so config logic stays testable with tempdirs and free of hardcoded system paths.
   - `<id>` is a v4 UUID generated at creation; the file path is `workspace_dir(app_data_dir).join("<id>.json")` (`src-tauri/src/workspace/config.rs:57`–`65`).

2. **Schema versioned.** The config carries `schemaVersion` (`WORKSPACE_SCHEMA_VERSION = 1`, `config.rs:19`), serialized camelCase with kebab-case permission values (`read-write` / `read-only` / `excluded`). `load_workspace` rejects a config whose `schemaVersion` is not the supported value as `InvalidWorkspaceConfig` (`config.rs:67`–`82`); malformed JSON fails the same way. There is no silent rewrite or silent upgrade.

3. **User knowledge directories are never modified.** Config writes only ever target the app-data `workspaces/` directory (atomic temp-file + rename, reusing the ADR 0002 pattern — `config.rs:84`–`98`). No `.ivynote`, no hidden directory, and no sidecar file is created inside a mount.

4. **The recent-workspaces list is a separate JSON file** at `<AppData>/<app>/workspaces/recent.json` (`src-tauri/src/workspace/recent.rs:8`), capped at 8 entries, most-recent-first, de-duplicated by workspace id (`recent.rs:16`–`36`).

5. **No SQLite in v0.2.** The index database stays deferred to v0.7; spec §6.4 already reserves `<AppData>/<app>/indexes/` for that milestone.

## Alternatives

- **Sidecar config inside the user's knowledge folder** (e.g. `<mount>/.ivynote/workspace.json`) — rejected: it pollutes the user's data directory, couples knowledge files to app state, and directly violates spec §6.4. An exported/backed-up knowledge folder would carry stale app state.
- **SQLite database now** — rejected: a single small JSON document per Workspace is simpler, human-readable, diffable, and trivially listable; the database-backed index is a v0.7 concern (YAGNI).
- **One global config file listing every workspace** — rejected: a per-workspace file keeps workspaces independent (one corrupt workspace cannot take down the list of others; `list_workspaces` skips unreadable files — `config.rs:229`–`243`) and gives each workspace a natural backup/export unit.

## Consequences

- Workspaces survive restarts and re-open one-click from the recent list; the config is ordinary versioned JSON that an expert user can inspect or back up.
- Uninstalling the app removes only app data; user notes are never touched by config lifecycle.
- Config write is atomic (temp + rename), so a crash cannot leave a half-written workspace file; failed writes leave the original config intact.
- Unknown or future schema versions fail closed with `InvalidWorkspaceConfig` rather than being silently reinterpreted or rewritten — matching spec §44's no-silent-migration rule.
- Absolute, platform-native paths are stored as-is; the app performs no cross-platform path normalization or rewriting of mount paths.

## Migration

`load_workspace` checks `schemaVersion` on every load and returns `InvalidWorkspaceConfig { id }` (a typed, user-visible error, code `invalidWorkspaceConfig`) when the file is corrupt or the version is unsupported. v0.2 ships schema version 1 only, so no in-place migration exists yet. When a later milestone changes the schema, the upgrade path will follow spec §44's sequence — detect old version, back up the config file, migrate, validate, then switch — and the version gate added here guarantees an old config is never silently upgraded in place.
