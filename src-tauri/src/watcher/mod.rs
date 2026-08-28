//! Per-mount, exclusion-aware, debounced file watching.
//!
//! One `notify::recommended_watcher` is started per readable mount. Raw notify
//! events flow over a channel into a per-mount thread that assembles renames,
//! drops excluded paths, debounces bursts (300 ms window), and emits
//! `WatcherEvent`s to the frontend via `app.emit("watcher://event", ...)`.

pub mod events;

use std::collections::VecDeque;
use std::path::{Component, Path, PathBuf};

use crossbeam_channel::RecvTimeoutError;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{Emitter, Manager};

use crate::errors::AppError;
use crate::watcher::events::WatcherEvent;

/// Idle gap after the last event before a burst is flushed to the frontend.
pub const DEBOUNCE_WINDOW_MS: u64 = 300;

/// Holds the active per-mount watchers in Tauri managed state so that
/// `stop_watching` can drop them (dropping stops each backend and causes its
/// debounce thread to observe a disconnected channel and exit).
pub struct WatcherState(pub(crate) std::sync::Mutex<Vec<RecommendedWatcher>>);

impl Default for WatcherState {
    fn default() -> Self {
        Self(std::sync::Mutex::new(Vec::new()))
    }
}

/// Stops any active watchers, then starts one recursive watcher per mount.
///
/// `mounts` is a slice of `(mount_path, effective_exclusions)`. Mounts that do
/// not exist on disk are logged and skipped rather than failing the whole
/// watch, so a temporarily unavailable mount does not take down the others.
pub fn start_watching(
    app: &tauri::AppHandle,
    mounts: &[(String, Vec<String>)],
) -> Result<(), AppError> {
    stop_watching(app)?;
    let state = app.state::<WatcherState>();
    let mut watchers = state.0.lock().unwrap();
    for (mount_path, exclusions) in mounts {
        let mount = PathBuf::from(mount_path);
        if !mount.is_dir() {
            log::warn!("skip watching non-existent mount: {mount_path}");
            continue;
        }
        let emit = {
            let app = app.clone();
            move |event: WatcherEvent| {
                if let Err(e) = app.emit("watcher://event", &event) {
                    log::error!("failed to emit watcher event: {e}");
                }
            }
        };
        match spawn_mount_watcher(mount, exclusions.clone(), DEBOUNCE_WINDOW_MS, emit) {
            Ok(watcher) => watchers.push(watcher),
            Err(e) => log::warn!("failed to start watcher for {mount_path}: {e:?}"),
        }
    }
    Ok(())
}

/// Drops all active watchers. Their debounce threads exit once their channels
/// disconnect.
pub fn stop_watching(app: &tauri::AppHandle) -> Result<(), AppError> {
    let state = app.state::<WatcherState>();
    let mut watchers = state.0.lock().unwrap();
    watchers.clear();
    Ok(())
}

fn real_now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

/// Starts one recursive notify watcher on `mount`, wires it into a debounce
/// thread, and returns the watcher handle. The caller owns the handle and is
/// responsible for dropping it to stop watching.
fn spawn_mount_watcher(
    mount: PathBuf,
    exclusions: Vec<String>,
    window_ms: u64,
    emit: impl Fn(WatcherEvent) + Send + 'static,
) -> Result<RecommendedWatcher, AppError> {
    let (tx, rx) = crossbeam_channel::unbounded::<notify::Event>();
    let mut watcher =
        notify::recommended_watcher(move |res: notify::Result<notify::Event>| match res {
            Ok(event) => {
                let _ = tx.send(event);
            }
            Err(e) => log::warn!("watcher error: {e}"),
        })
        .map_err(|e| AppError::Io {
            message: format!("failed to create watcher: {e}"),
        })?;
    watcher
        .watch(&mount, RecursiveMode::Recursive)
        .map_err(|e| AppError::Io {
            message: format!("failed to watch {}: {e}", mount.display()),
        })?;

    let mut debouncer = Debouncer::new(window_ms, real_now);
    let mut assembler = RenameAssembler::new();
    std::thread::spawn(move || loop {
        match rx.recv_timeout(std::time::Duration::from_millis(window_ms)) {
            Ok(event) => {
                for watcher_event in assembler.handle(&event) {
                    if let Some(filtered) = filter_event(watcher_event, &mount, &exclusions) {
                        debouncer.push(filtered);
                    }
                }
            }
            Err(RecvTimeoutError::Timeout) => {
                for event in debouncer.flush_if_due() {
                    emit(event);
                }
                // A From rename with no matching To never became a rename; the
                // source path is gone, so surface it as a removal.
                for watcher_event in assembler.drain_stale_froms() {
                    if let Some(filtered) = filter_event(watcher_event, &mount, &exclusions) {
                        emit(filtered);
                    }
                }
            }
            Err(RecvTimeoutError::Disconnected) => {
                for event in debouncer.flush_forced() {
                    emit(event);
                }
                for watcher_event in assembler.drain_stale_froms() {
                    if let Some(filtered) = filter_event(watcher_event, &mount, &exclusions) {
                        emit(filtered);
                    }
                }
                break;
            }
        }
    });
    Ok(watcher)
}

/// Coalesces bursts of events into a single flush. The "now" clock is
/// injectable so tests are deterministic.
pub struct Debouncer<F> {
    window_ms: u64,
    now: F,
    pending: Vec<WatcherEvent>,
    last_activity_ms: Option<u64>,
}

impl<F: Fn() -> u64> Debouncer<F> {
    pub fn new(window_ms: u64, now: F) -> Self {
        Self {
            window_ms,
            now,
            pending: Vec::new(),
            last_activity_ms: None,
        }
    }

    /// Queues an event and restarts the debounce window.
    pub fn push(&mut self, event: WatcherEvent) {
        self.pending.push(event);
        self.last_activity_ms = Some((self.now)());
    }

    /// Drains the pending burst once the window has elapsed since the last
    /// event; returns nothing while the window is still open.
    pub fn flush_if_due(&mut self) -> Vec<WatcherEvent> {
        let now = (self.now)();
        let due = matches!(self.last_activity_ms, Some(last) if now.saturating_sub(last) >= self.window_ms);
        if due {
            self.last_activity_ms = None;
            std::mem::take(&mut self.pending)
        } else {
            Vec::new()
        }
    }

    /// Drains the pending burst regardless of the window (used on shutdown).
    pub fn flush_forced(&mut self) -> Vec<WatcherEvent> {
        self.last_activity_ms = None;
        std::mem::take(&mut self.pending)
    }
}

/// Turns raw `notify::Event`s into `WatcherEvent`s.
///
/// Renames arrive as a `From` event followed by a `To` event. Windows does not
/// attach a tracker id (unlike inotify), so `From` paths are paired with the
/// next `To` in FIFO order; an unmatched `To` is treated as a creation and a
/// `From` that never resolves is drained as a removal.
pub struct RenameAssembler {
    pending_from: VecDeque<String>,
}

impl Default for RenameAssembler {
    fn default() -> Self {
        Self::new()
    }
}

impl RenameAssembler {
    pub fn new() -> Self {
        Self {
            pending_from: VecDeque::new(),
        }
    }

    pub fn handle(&mut self, event: &notify::Event) -> Vec<WatcherEvent> {
        use notify::event::{EventKind, ModifyKind, RenameMode};
        match event.kind {
            EventKind::Create(_) => single_path_event(event, |path| WatcherEvent::Created { path }),
            EventKind::Remove(_) => single_path_event(event, |path| WatcherEvent::Removed { path }),
            EventKind::Modify(ModifyKind::Name(RenameMode::Both))
            | EventKind::Modify(ModifyKind::Name(RenameMode::Any)) => rename_pair(event),
            EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
                if let Some(path) = event.paths.first() {
                    self.pending_from
                        .push_back(path.to_string_lossy().into_owned());
                }
                Vec::new()
            }
            EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
                let Some(to) = event.paths.first() else {
                    return Vec::new();
                };
                let to = to.to_string_lossy().into_owned();
                match self.pending_from.pop_front() {
                    Some(from) => vec![WatcherEvent::Renamed { from, to }],
                    None => vec![WatcherEvent::Created { path: to }],
                }
            }
            _ => Vec::new(),
        }
    }

    /// Returns `Removed` events for `From` paths that never paired with a `To`.
    pub fn drain_stale_froms(&mut self) -> Vec<WatcherEvent> {
        self.pending_from
            .drain(..)
            .map(|from| WatcherEvent::Removed { path: from })
            .collect()
    }
}

fn single_path_event(
    event: &notify::Event,
    make: impl Fn(String) -> WatcherEvent,
) -> Vec<WatcherEvent> {
    event
        .paths
        .first()
        .map(|path| vec![make(path.to_string_lossy().into_owned())])
        .unwrap_or_default()
}

fn rename_pair(event: &notify::Event) -> Vec<WatcherEvent> {
    match (event.paths.first(), event.paths.get(1)) {
        (Some(from), Some(to)) => vec![WatcherEvent::Renamed {
            from: from.to_string_lossy().into_owned(),
            to: to.to_string_lossy().into_owned(),
        }],
        _ => Vec::new(),
    }
}

/// True when `path` has a component below `mount` whose name is in
/// `exclusions`. The mount prefix itself is never checked, matching the
/// scanner which only excludes children of the mount root.
pub fn is_excluded(mount: &Path, path: &Path, exclusions: &[String]) -> bool {
    match path.strip_prefix(mount) {
        Ok(relative) => relative.components().any(|component| match component {
            Component::Normal(name) => {
                let name = name.to_string_lossy();
                exclusions
                    .iter()
                    .any(|excluded| excluded.as_str() == name.as_ref())
            }
            _ => false,
        }),
        Err(_) => false,
    }
}

/// Applies exclusion filtering to a single event. Renames crossing an
/// exclusion boundary are degraded to the visible half of the change.
pub fn filter_event(
    event: WatcherEvent,
    mount: &Path,
    exclusions: &[String],
) -> Option<WatcherEvent> {
    match event {
        WatcherEvent::Created { path } => {
            if is_excluded(mount, Path::new(&path), exclusions) {
                None
            } else {
                Some(WatcherEvent::Created { path })
            }
        }
        WatcherEvent::Removed { path } => {
            if is_excluded(mount, Path::new(&path), exclusions) {
                None
            } else {
                Some(WatcherEvent::Removed { path })
            }
        }
        WatcherEvent::Renamed { from, to } => {
            let from_excluded = is_excluded(mount, Path::new(&from), exclusions);
            let to_excluded = is_excluded(mount, Path::new(&to), exclusions);
            match (from_excluded, to_excluded) {
                (false, false) => Some(WatcherEvent::Renamed { from, to }),
                (false, true) => Some(WatcherEvent::Removed { path: from }),
                (true, false) => Some(WatcherEvent::Created { path: to }),
                (true, true) => None,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{CreateKind, DataChange, EventKind, ModifyKind, RemoveKind, RenameMode};
    use std::cell::RefCell;
    use std::path::PathBuf;
    use std::rc::Rc;

    fn fake_clock() -> (Rc<RefCell<u64>>, impl Fn() -> u64) {
        let clock = Rc::new(RefCell::new(0u64));
        let now = {
            let clock = clock.clone();
            move || *clock.borrow()
        };
        (clock, now)
    }

    fn event(kind: EventKind, paths: &[&str]) -> notify::Event {
        let mut e = notify::Event::new(kind);
        for path in paths {
            e.paths.push(PathBuf::from(path));
        }
        e
    }

    #[test]
    fn burst_of_events_within_window_coalesces_into_single_flush() {
        let (clock, now) = fake_clock();
        let mut debouncer = Debouncer::new(300, now);

        *clock.borrow_mut() = 0;
        debouncer.push(WatcherEvent::Created {
            path: "a.md".into(),
        });
        *clock.borrow_mut() = 100;
        debouncer.push(WatcherEvent::Created {
            path: "b.md".into(),
        });
        *clock.borrow_mut() = 200;
        debouncer.push(WatcherEvent::Created {
            path: "c.md".into(),
        });

        *clock.borrow_mut() = 500;
        let flushed = debouncer.flush_if_due();

        assert_eq!(
            flushed,
            vec![
                WatcherEvent::Created {
                    path: "a.md".into()
                },
                WatcherEvent::Created {
                    path: "b.md".into()
                },
                WatcherEvent::Created {
                    path: "c.md".into()
                },
            ]
        );
        assert!(debouncer.flush_if_due().is_empty());
    }

    #[test]
    fn flush_before_the_window_elapses_returns_nothing() {
        let (clock, now) = fake_clock();
        let mut debouncer = Debouncer::new(300, now);

        *clock.borrow_mut() = 0;
        debouncer.push(WatcherEvent::Created {
            path: "a.md".into(),
        });

        *clock.borrow_mut() = 200;
        assert!(debouncer.flush_if_due().is_empty());
    }

    #[test]
    fn events_after_the_window_flush_separately() {
        let (clock, now) = fake_clock();
        let mut debouncer = Debouncer::new(300, now);

        *clock.borrow_mut() = 0;
        debouncer.push(WatcherEvent::Created {
            path: "a.md".into(),
        });
        *clock.borrow_mut() = 100;
        debouncer.push(WatcherEvent::Created {
            path: "b.md".into(),
        });
        *clock.borrow_mut() = 200;
        debouncer.push(WatcherEvent::Created {
            path: "c.md".into(),
        });

        *clock.borrow_mut() = 500;
        let first = debouncer.flush_if_due();
        assert_eq!(first.len(), 3);

        *clock.borrow_mut() = 600;
        debouncer.push(WatcherEvent::Removed {
            path: "c.md".into(),
        });
        *clock.borrow_mut() = 800;
        assert!(
            debouncer.flush_if_due().is_empty(),
            "a new event restarts the window"
        );
        *clock.borrow_mut() = 900;
        let second = debouncer.flush_if_due();
        assert_eq!(
            second,
            vec![WatcherEvent::Removed {
                path: "c.md".into()
            }]
        );
    }

    #[test]
    fn forced_flush_drains_pending_events() {
        let (clock, now) = fake_clock();
        let mut debouncer = Debouncer::new(300, now);

        *clock.borrow_mut() = 0;
        debouncer.push(WatcherEvent::Created {
            path: "a.md".into(),
        });
        assert_eq!(debouncer.flush_forced().len(), 1);
        assert!(debouncer.flush_forced().is_empty());
    }

    #[test]
    fn is_excluded_matches_directory_components_below_the_mount() {
        let mount = std::path::Path::new("C:\\notes");
        let exclusions = vec!["node_modules".to_string(), ".git".to_string()];

        assert!(is_excluded(
            mount,
            std::path::Path::new("C:\\notes\\node_modules\\x.md"),
            &exclusions
        ));
        assert!(is_excluded(
            mount,
            std::path::Path::new("C:\\notes\\sub\\.git\\y.md"),
            &exclusions
        ));
        assert!(!is_excluded(
            mount,
            std::path::Path::new("C:\\notes\\a.md"),
            &exclusions
        ));
        assert!(!is_excluded(
            mount,
            std::path::Path::new("C:\\notes\\node_modules2\\a.md"),
            &exclusions
        ));
        assert!(!is_excluded(mount, mount, &exclusions));
    }

    #[test]
    fn filter_event_drops_events_inside_excluded_directories() {
        let mount = std::path::Path::new("C:\\notes");
        let exclusions = vec!["node_modules".to_string()];

        assert_eq!(
            filter_event(
                WatcherEvent::Created {
                    path: "C:\\notes\\node_modules\\x.md".into()
                },
                mount,
                &exclusions
            ),
            None
        );
        assert_eq!(
            filter_event(
                WatcherEvent::Created {
                    path: "C:\\notes\\a.md".into()
                },
                mount,
                &exclusions
            ),
            Some(WatcherEvent::Created {
                path: "C:\\notes\\a.md".into()
            })
        );
    }

    #[test]
    fn filter_event_converts_renames_across_exclusion_boundaries() {
        let mount = std::path::Path::new("C:\\notes");
        let exclusions = vec!["node_modules".to_string()];

        assert_eq!(
            filter_event(
                WatcherEvent::Renamed {
                    from: "C:\\notes\\a.md".into(),
                    to: "C:\\notes\\node_modules\\b.md".into()
                },
                mount,
                &exclusions
            ),
            Some(WatcherEvent::Removed {
                path: "C:\\notes\\a.md".into()
            })
        );
        assert_eq!(
            filter_event(
                WatcherEvent::Renamed {
                    from: "C:\\notes\\node_modules\\b.md".into(),
                    to: "C:\\notes\\a.md".into()
                },
                mount,
                &exclusions
            ),
            Some(WatcherEvent::Created {
                path: "C:\\notes\\a.md".into()
            })
        );
        assert_eq!(
            filter_event(
                WatcherEvent::Renamed {
                    from: "C:\\notes\\node_modules\\a.md".into(),
                    to: "C:\\notes\\node_modules\\b.md".into()
                },
                mount,
                &exclusions
            ),
            None
        );
        assert_eq!(
            filter_event(
                WatcherEvent::Renamed {
                    from: "C:\\notes\\a.md".into(),
                    to: "C:\\notes\\b.md".into()
                },
                mount,
                &exclusions
            ),
            Some(WatcherEvent::Renamed {
                from: "C:\\notes\\a.md".into(),
                to: "C:\\notes\\b.md".into()
            })
        );
    }

    #[test]
    fn assembler_emits_created_and_removed_events() {
        let mut assembler = RenameAssembler::new();
        assert_eq!(
            assembler.handle(&event(
                EventKind::Create(CreateKind::File),
                &["C:\\notes\\a.md"]
            )),
            vec![WatcherEvent::Created {
                path: "C:\\notes\\a.md".into()
            }]
        );
        assert_eq!(
            assembler.handle(&event(
                EventKind::Remove(RemoveKind::File),
                &["C:\\notes\\a.md"]
            )),
            vec![WatcherEvent::Removed {
                path: "C:\\notes\\a.md".into()
            }]
        );
    }

    #[test]
    fn assembler_pairs_rename_from_and_to_events_in_order() {
        let mut assembler = RenameAssembler::new();

        assert!(
            assembler
                .handle(&event(
                    EventKind::Modify(ModifyKind::Name(RenameMode::From)),
                    &["C:\\notes\\a.md"]
                ))
                .is_empty(),
            "a From event alone emits nothing"
        );

        assert_eq!(
            assembler.handle(&event(
                EventKind::Modify(ModifyKind::Name(RenameMode::To)),
                &["C:\\notes\\b.md"]
            )),
            vec![WatcherEvent::Renamed {
                from: "C:\\notes\\a.md".into(),
                to: "C:\\notes\\b.md".into()
            }]
        );
    }

    #[test]
    fn assembler_emits_renamed_for_both_event() {
        let mut assembler = RenameAssembler::new();
        assert_eq!(
            assembler.handle(&event(
                EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
                &["C:\\notes\\a.md", "C:\\notes\\b.md"]
            )),
            vec![WatcherEvent::Renamed {
                from: "C:\\notes\\a.md".into(),
                to: "C:\\notes\\b.md".into()
            }]
        );
    }

    #[test]
    fn assembler_treats_unmatched_to_event_as_created() {
        let mut assembler = RenameAssembler::new();
        assert_eq!(
            assembler.handle(&event(
                EventKind::Modify(ModifyKind::Name(RenameMode::To)),
                &["C:\\notes\\b.md"]
            )),
            vec![WatcherEvent::Created {
                path: "C:\\notes\\b.md".into()
            }]
        );
    }

    #[test]
    fn assembler_drains_unpaired_from_events_as_removals() {
        let mut assembler = RenameAssembler::new();
        assembler.handle(&event(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            &["C:\\notes\\a.md"],
        ));
        assembler.handle(&event(
            EventKind::Modify(ModifyKind::Name(RenameMode::From)),
            &["C:\\notes\\b.md"],
        ));

        assert_eq!(
            assembler.drain_stale_froms(),
            vec![
                WatcherEvent::Removed {
                    path: "C:\\notes\\a.md".into()
                },
                WatcherEvent::Removed {
                    path: "C:\\notes\\b.md".into()
                },
            ]
        );
        assert!(assembler.drain_stale_froms().is_empty());
    }

    #[test]
    fn assembler_ignores_content_modifications() {
        let mut assembler = RenameAssembler::new();
        assert!(assembler
            .handle(&event(
                EventKind::Modify(ModifyKind::Data(DataChange::Content)),
                &["C:\\notes\\a.md"]
            ))
            .is_empty());
    }

    #[test]
    fn watch_tempdir_delivers_a_created_event() {
        let dir = tempfile::tempdir().expect("temp dir must be creatable");
        let collected = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let collector = {
            let collected = collected.clone();
            move |watcher_event: WatcherEvent| {
                collected.lock().unwrap().push(watcher_event);
            }
        };

        let watcher = spawn_mount_watcher(dir.path().to_path_buf(), Vec::new(), 100, collector)
            .expect("watcher must start");
        let file = dir.path().join("hello.md");
        std::fs::write(&file, "# hi").expect("file must be writable");

        let expected = file.to_string_lossy().into_owned();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        let saw_created = loop {
            let events = collected.lock().unwrap().clone();
            if events
                .iter()
                .any(|e| matches!(e, WatcherEvent::Created { path } if path.as_str() == expected))
            {
                break true;
            }
            if std::time::Instant::now() >= deadline {
                break false;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        };
        drop(watcher);

        assert!(
            saw_created,
            "expected a Created event for {expected} within 10s"
        );
    }
}
