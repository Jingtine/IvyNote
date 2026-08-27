pub mod config;
pub mod recent;

use std::fs;
use std::path::{Component, Path, PathBuf};

use config::{MountConfig, MountPermission};

/// Returns the first mount whose canonical path is an ancestor of (or equal
/// to) `path`.
///
/// Matching is a component-wise prefix comparison on canonicalized paths so
/// relative/absolute spelling and Windows case differences resolve; when
/// canonicalization fails for either side, the raw path is used for that
/// side. On Windows, normal components are compared case-insensitively.
pub fn mount_for_path<'a>(mounts: &'a [MountConfig], path: &Path) -> Option<&'a MountConfig> {
    let canonical = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    mounts.iter().find(|mount| {
        let mount_canon =
            fs::canonicalize(&mount.path).unwrap_or_else(|_| PathBuf::from(&mount.path));
        path_is_within(&mount_canon, &canonical)
    })
}

/// True only for `read-write` mounts; read-only and excluded mounts refuse
/// mutation.
pub fn is_read_write(mount: &MountConfig) -> bool {
    mount.permission == MountPermission::ReadWrite
}

fn path_is_within(mount: &Path, child: &Path) -> bool {
    let mount_parts: Vec<Component<'_>> = mount.components().collect();
    let child_parts: Vec<Component<'_>> = child.components().collect();
    if child_parts.len() < mount_parts.len() {
        return false;
    }
    mount_parts
        .iter()
        .zip(&child_parts)
        .all(|(a, b)| component_eq(a, b))
}

fn component_eq(a: &Component<'_>, b: &Component<'_>) -> bool {
    match (a, b) {
        (Component::Normal(x), Component::Normal(y)) => {
            if cfg!(windows) {
                x.to_string_lossy()
                    .eq_ignore_ascii_case(&y.to_string_lossy())
            } else {
                x == y
            }
        }
        (x, y) => x == y,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rw_mount(path: &str) -> MountConfig {
        MountConfig {
            path: path.to_string(),
            permission: MountPermission::ReadWrite,
            exclusions: None,
        }
    }

    #[test]
    fn mount_for_path_matches_file_inside_mount() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Notes");
        fs::create_dir_all(&root).unwrap();
        let nested = root.join("sub").join("note.md");
        fs::create_dir_all(nested.parent().unwrap()).unwrap();
        fs::write(&nested, b"x").unwrap();

        let mounts = vec![rw_mount(&root.to_string_lossy())];
        let found = mount_for_path(&mounts, &nested).expect("nested file must match mount");
        assert_eq!(found.path, root.to_string_lossy());
        assert!(is_read_write(found));
    }

    #[test]
    fn mount_for_path_matches_mount_root_itself() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Notes");
        fs::create_dir_all(&root).unwrap();
        let mounts = vec![rw_mount(&root.to_string_lossy())];
        assert!(mount_for_path(&mounts, &root).is_some());
    }

    #[test]
    fn mount_for_path_returns_none_for_outside_path() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Notes");
        fs::create_dir_all(&root).unwrap();
        let outside = tmp.path().join("elsewhere.md");
        fs::write(&outside, b"x").unwrap();
        let mounts = vec![rw_mount(&root.to_string_lossy())];
        assert!(mount_for_path(&mounts, &outside).is_none());
    }

    #[test]
    fn mount_for_path_does_not_match_sibling_with_shared_prefix() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path().join("Notes");
        fs::create_dir_all(&root).unwrap();
        let sibling = tmp.path().join("Notes2");
        fs::create_dir_all(&sibling).unwrap();
        let inside = sibling.join("note.md");
        fs::write(&inside, b"x").unwrap();
        let mounts = vec![rw_mount(&root.to_string_lossy())];
        assert!(mount_for_path(&mounts, &inside).is_none());
    }

    #[test]
    fn mount_for_path_distinguishes_same_and_cross_mount() {
        let tmp = tempfile::tempdir().unwrap();
        let a = tmp.path().join("A");
        let b = tmp.path().join("B");
        fs::create_dir_all(&a).unwrap();
        fs::create_dir_all(&b).unwrap();
        let in_a = a.join("note.md");
        fs::write(&in_a, b"x").unwrap();
        let in_b = b.join("note.md");
        fs::write(&in_b, b"x").unwrap();

        let mounts = vec![
            rw_mount(&a.to_string_lossy()),
            rw_mount(&b.to_string_lossy()),
        ];
        let a1 = mount_for_path(&mounts, &in_a).unwrap();
        let a2 = mount_for_path(&mounts, &a).unwrap();
        let b1 = mount_for_path(&mounts, &in_b).unwrap();
        assert!(
            std::ptr::eq(a1, a2),
            "same mount must resolve to the same entry"
        );
        assert!(
            !std::ptr::eq(a1, b1),
            "different mounts must resolve to different entries"
        );
    }

    #[test]
    fn is_read_write_only_true_for_read_write_mounts() {
        let mut mount = rw_mount("x");
        assert!(is_read_write(&mount));
        mount.permission = MountPermission::ReadOnly;
        assert!(!is_read_write(&mount));
        mount.permission = MountPermission::Excluded;
        assert!(!is_read_write(&mount));
    }
}
