use std::fs;
use std::path::{Path, PathBuf};

use crate::errors::AppError;
use crate::filesystem::model::{FileNodeKind, FileTreeNode};

/// Directory names that are never recursed into during a workspace scan.
const IGNORED_DIRECTORY_NAMES: [&str; 5] = [".git", "node_modules", "dist", "build", "target"];

/// Scans the given root directory and returns a tree of Markdown files.
///
/// The root is canonicalized once; recursion never leaves that root because
/// symlinked directories are skipped. Directories only appear in the result
/// when they contain at least one nested Markdown file. File contents are
/// never read during the scan.
pub fn scan_markdown_tree(root: &Path) -> Result<Vec<FileTreeNode>, AppError> {
    let canonical_root = canonicalize_root(root)?;
    Ok(scan_directory(&canonical_root)?.unwrap_or_default())
}

fn canonicalize_root(root: &Path) -> Result<PathBuf, AppError> {
    match fs::canonicalize(root) {
        Ok(path) => {
            let metadata = fs::metadata(&path).map_err(|e| io_error(e, root))?;
            if !metadata.is_dir() {
                return Err(AppError::InvalidPath {
                    path: display_path(root)?,
                });
            }
            Ok(path)
        }
        Err(e) => Err(io_error(e, root)),
    }
}

fn io_error(e: std::io::Error, path: &Path) -> AppError {
    match e.kind() {
        std::io::ErrorKind::NotFound => AppError::FileNotFound {
            path: display_path(path).unwrap_or_else(|_| path.to_string_lossy().into_owned()),
        },
        std::io::ErrorKind::PermissionDenied => AppError::PermissionDenied {
            path: display_path(path).unwrap_or_else(|_| path.to_string_lossy().into_owned()),
        },
        _ => AppError::Io {
            message: e.to_string(),
        },
    }
}

/// Converts a path to a string, rejecting non-UTF-8 paths as invalid.
fn display_path(path: &Path) -> Result<String, AppError> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| AppError::InvalidPath {
            path: path.to_string_lossy().into_owned(),
        })
}

/// Scans one directory, returning `None` when it holds no Markdown files.
fn scan_directory(dir: &Path) -> Result<Option<Vec<FileTreeNode>>, AppError> {
    let entries = fs::read_dir(dir).map_err(|e| io_error(e, dir))?;

    let mut nodes = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| io_error(e, dir))?;
        let path = entry.path();

        // symlink_metadata does not follow symlinks, so symlinked directories
        // are detected here and skipped rather than recursed into.
        let metadata = fs::symlink_metadata(&path).map_err(|e| io_error(e, &path))?;
        let file_type = metadata.file_type();
        if file_type.is_symlink() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().into_owned();
        if file_type.is_dir() {
            if IGNORED_DIRECTORY_NAMES.contains(&name.as_str()) {
                continue;
            }
            if let Some(children) = scan_directory(&path)? {
                nodes.push(FileTreeNode {
                    name,
                    path: display_path(&path)?,
                    kind: FileNodeKind::Directory,
                    children: Some(children),
                });
            }
        } else if is_markdown_file(&name) {
            nodes.push(FileTreeNode {
                name,
                path: display_path(&path)?,
                kind: FileNodeKind::Markdown,
                children: None,
            });
        }
    }

    Ok(if nodes.is_empty() {
        None
    } else {
        Some(sort_nodes(nodes))
    })
}

fn is_markdown_file(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(".md")
}

/// Directories sort before files; names compare case-insensitively so the
/// tree order is stable for display regardless of filesystem case rules.
fn sort_nodes(mut nodes: Vec<FileTreeNode>) -> Vec<FileTreeNode> {
    nodes.sort_by(|a, b| {
        let kind_order = |n: &FileTreeNode| match n.kind {
            FileNodeKind::Directory => 0,
            FileNodeKind::Markdown => 1,
        };
        kind_order(a)
            .cmp(&kind_order(b))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    nodes
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    #[cfg(unix)]
    use std::os::unix::fs::symlink as symlink_dir;
    #[cfg(windows)]
    use std::os::windows::fs::symlink_dir;

    fn write_file(dir: &Path, name: &str, contents: &str) {
        let path = dir.join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("test dirs must be creatable");
        }
        fs::write(path, contents).expect("test file must be writable");
    }

    fn node_names(nodes: &[FileTreeNode]) -> Vec<String> {
        nodes.iter().map(|n| n.name.clone()).collect()
    }

    fn find<'a>(nodes: &'a [FileTreeNode], name: &str) -> Option<&'a FileTreeNode> {
        nodes.iter().find(|n| n.name == name)
    }

    fn names_of_layout_root() -> Vec<String> {
        vec!["Notes".to_string(), "README.md".to_string()]
    }

    #[test]
    fn scans_brief_layout_including_nested_directories() {
        let root = tempfile::tempdir().expect("temp root must be creatable");
        write_file(root.path(), "README.md", "# readme");
        write_file(root.path(), "Notes/hello.md", "# hello");
        write_file(root.path(), "ignore.txt", "not markdown");
        write_file(root.path(), ".git/hidden.md", "# hidden");

        let tree = scan_markdown_tree(root.path()).expect("scan must succeed");
        assert_eq!(node_names(&tree), names_of_layout_root());

        let notes = find(&tree, "Notes").expect("Notes dir must be present");
        assert_eq!(notes.kind, FileNodeKind::Directory);
        let notes_children = notes.children.as_ref().expect("dir has children");
        assert_eq!(node_names(notes_children), vec!["hello.md".to_string()]);

        let readme = find(&tree, "README.md").expect("README.md must be present");
        assert_eq!(readme.kind, FileNodeKind::Markdown);
        assert!(readme.children.is_none());

        let hello = find(notes_children, "hello.md").expect("hello.md must be present");
        assert_eq!(hello.kind, FileNodeKind::Markdown);
    }

    #[test]
    fn directory_paths_are_absolute_children_of_canonical_root() {
        let root = tempfile::tempdir().expect("temp root must be creatable");
        write_file(root.path(), "Notes/hello.md", "# hello");

        let tree = scan_markdown_tree(root.path()).expect("scan must succeed");
        let notes = find(&tree, "Notes").expect("Notes dir must be present");
        let expected_notes_path: PathBuf = fs::canonicalize(root.path())
            .expect("root canonicalizes")
            .join("Notes");
        assert_eq!(PathBuf::from(notes.path.clone()), expected_notes_path);
        let hello =
            find(notes.children.as_ref().expect("children"), "hello.md").expect("hello.md present");
        assert_eq!(
            PathBuf::from(hello.path.clone()),
            expected_notes_path.join("hello.md")
        );
    }

    #[test]
    fn directories_without_markdown_are_excluded() {
        let root = tempfile::tempdir().expect("temp root must be creatable");
        write_file(root.path(), "Empty/placeholder.txt", "no markdown here");
        write_file(root.path(), "Deeper/StillEmpty/.keep", "");

        let tree = scan_markdown_tree(root.path()).expect("scan must succeed");
        assert!(tree.is_empty(), "no markdown anywhere, got: {tree:?}");
    }

    #[test]
    fn ignored_directories_are_excluded() {
        let root = tempfile::tempdir().expect("temp root must be creatable");
        for ignored in ["node_modules", "dist", "build", "target"] {
            write_file(root.path(), &format!("{ignored}/lib.md"), "# lib");
        }

        let tree = scan_markdown_tree(root.path()).expect("scan must succeed");
        assert!(
            tree.is_empty(),
            "ignored dirs must not appear, got: {tree:?}"
        );
    }

    #[test]
    fn directories_sort_before_files_case_insensitive() {
        let root = tempfile::tempdir().expect("temp root must be creatable");
        write_file(root.path(), "b.md", "");
        write_file(root.path(), "A.md", "");
        write_file(root.path(), "zeta/nested.md", "");
        write_file(root.path(), "ALPHA/x.md", "");

        let tree = scan_markdown_tree(root.path()).expect("scan must succeed");
        assert_eq!(node_names(&tree), vec!["ALPHA", "zeta", "A.md", "b.md"]);
    }

    #[test]
    fn nonexistent_root_returns_file_not_found() {
        let root = tempfile::tempdir().expect("temp root must be creatable");
        let missing = root.path().join("does-not-exist");
        let err = scan_markdown_tree(&missing).expect_err("missing root must fail");
        match err {
            AppError::FileNotFound { path } => {
                assert!(path.contains("does-not-exist"), "path was {path}");
            }
            other => panic!("expected FileNotFound, got {other:?}"),
        }
    }

    #[test]
    fn root_that_is_a_file_returns_invalid_path() {
        let root = tempfile::tempdir().expect("temp root must be creatable");
        let file = root.path().join("file.md");
        fs::write(&file, "# hi").expect("file must be writable");

        let err = scan_markdown_tree(&file).expect_err("file root must fail");
        match err {
            AppError::InvalidPath { path } => {
                assert!(path.ends_with("file.md"), "path was {path}");
            }
            other => panic!("expected InvalidPath, got {other:?}"),
        }
    }

    #[test]
    fn symlinked_directory_is_not_followed() {
        let outside = tempfile::tempdir().expect("outside temp must be creatable");
        let root = tempfile::tempdir().expect("root temp must be creatable");
        write_file(outside.path(), "linked.md", "# linked");

        let link = root.path().join("linked");
        match symlink_dir(outside.path(), &link) {
            Ok(()) => {}
            Err(e) if e.raw_os_error() == Some(1314) => {
                // Windows symlink privilege unavailable; skip with a clear message.
                eprintln!(
                    "SKIPPED: symlink creation requires developer mode/admin (os error 1314)"
                );
                return;
            }
            Err(e) => panic!("symlink creation failed unexpectedly: {e}"),
        }

        write_file(root.path(), "real.md", "# real");
        let tree = scan_markdown_tree(root.path()).expect("scan must succeed");
        assert_eq!(
            node_names(&tree),
            vec!["real.md".to_string()],
            "symlinked dir must not be followed, got: {tree:?}"
        );
    }
}
