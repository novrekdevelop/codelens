//! Filesystem commands: open a project folder, read the tree, read/write files.

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::RwLock;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TreeNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<TreeNode>>,
}

/// Directories we never load into the tree (build caches, VCS, editor junk).
const SKIP_DIRS: &[&str] = &[
    ".git",
    ".github",
    "node_modules",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    ".venv",
    "venv",
    "__pycache__",
    ".idea",
    ".vscode",
    ".qodo",
    ".cargo",
    ".cache",
];

const MAX_DEPTH: usize = 9;

/// Managed key under which the opened project root is stored in `ProjectState`.
const ROOT_KEY: &str = "project_root";

/// The currently open project folder, tracked in process so that every later
/// read/write stays inside it. This is the main defense against prompt injection:
/// a malicious file the AI is asked to read cannot make the app read or write
/// files anywhere else on disk.
pub struct ProjectState {
    pub root: RwLock<HashMap[String, PathBuf]>,
}

impl Default for ProjectState {
    fn default() -> Self {
        Self {
            root: RwLock::new(HashMap::new()),
        }
    }
}

fn build_tree(root: &Path, depth: usize) -> Option<TreeNode> {
    let name = root
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.to_string_lossy().into_owned());
    let path = root.to_string_lossy().into_owned();

    let is_dir = root.is_dir();
    if !is_dir {
        return Some(TreeNode {
            name,
            path,
            is_dir: false,
            children: None,
        });
    }
    if depth >= MAX_DEPTH {
        return Some(TreeNode {
            name,
            path,
            is_dir: true,
            children: Some(vec![]),
        });
    }

    let mut children = Vec::new();
    if let Ok(rd) = fs::read_dir(root) {
        for entry in rd.flatten() {
            let p = entry.path();
            let ename = entry.file_name().to_string_lossy().into_owned();
            if ename.starts_with('.') {
                continue;
            }
            let is_child_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if is_child_dir && SKIP_DIRS.contains(&ename.as_str()) {
                continue;
            }
            if let Some(node) = build_tree(&p, depth + 1) {
                children.push(node);
            }
        }
    }

    children.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Some(TreeNode {
        name,
        path,
        is_dir: true,
        children: Some(children),
    })
}

/// Native folder picker. Returns None when the user cancels.
#[tauri::command]
pub fn open_folder_dialog() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("Open Project Folder")
        .pick_folder()
        .map(|p| p.to_string_lossy().into_owned())
}

/// Recursively read a project folder into a tree structure.
///
/// This is also the "open project" operation: it records `root` as the boundary
/// that every later `read_file`/`write_file` must stay inside.
#[tauri::command]
pub fn read_folder_tree(app: AppHandle, root: String) -> Result<TreeNode, String> {
    let path = PathBuf::from(&root);
    if !path.is_absolute() {
        return Err(format!("Project folder path must be absolute: {root}"));
    }
    if !path.is_dir() {
        return Err(format!("Not a directory: {root}"));
    }
    app.state::<ProjectState>()
        .root
        .write()
        .unwrap()
        .insert(ROOT_KEY.to_string(), path.clone());
    build_tree(&path, 0).ok_or_else(|| format!("Failed to read folder: {root}"))
}

/// Read a file's UTF-8 text content — only from inside the opened project.
#[tauri::command]
pub fn read_file(app: AppHandle, path: String) -> Result<String, String> {
    let resolved = resolve_within_root(&app, &path)?;
    fs::read_to_string(&resolved).map_err(|e| format!(
        "Failed to read {}: {e}",
        resolved.to_string_lossy().into_owned(),
    ))
}

/// Write text content to a file (creates/overwrites) — only inside the opened
/// project folder, validated before any directory is created or file written.
#[tauri::command]
pub fn write_file(app: AppHandle, path: String, content: String) -> Result<(), String> {
    let resolved = resolve_within_root(&app, &path)?;
    if let Some(parent) = resolved.parent() {
        fs::create_dir_all(parent).map_err(|e| format!(
            "Failed to create parent directories for {}: {e}",
            resolved.to_string_lossy().into_owned(),
        ))?;
    }
    fs::write(&resolved, content).map_err(|e| format!(
        "Failed to write {}: {e}",
        resolved.to_string_lossy().into_owned(),
    ))
}

/// Native "Save As" dialog. Returns None when the user cancels.
#[tauri::command]
pub fn pick_save_file(default_path: Option<String>) -> Option<String> {
    let mut dialog = rfd::FileDialog::new().set_title("Save File As");
    if let Some(dp) = default_path {
        dialog = dialog.set_file_name(&dp);
    }
    dialog.save_file().map(|p| p.to_string_lossy().into_owned())
}

/// Returns the currently opened project root, or an error when no folder is open.
fn project_root(app: &AppHandle) -> Result<PathBuf, String> {
    match app.state::<ProjectState>().root.read().unwrap().get(&ROOT_KEY.to_string()) {
        Some(p) => Ok(p),
        None => Err("No project folder opened. Open a folder first.".to_string()),
    }
}

/// Resolve `.` and `..` components lexically, without touching the filesystem.
fn normalize_lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Canonicalize the deepest existing ancestor of `path` and re-attach the
/// (already lexically normalized) remainder, so symlinks in directories that
/// already exist are resolved while writes to not-yet-created files still work.
fn canonicalize_existing(path: &Path) -> Option<PathBuf> {
    let mut existing = PathBuf::from(path);
    let mut suffix: Vec[String] = Vec::new();
    loop {
        match fs::canonicalize(&existing) {
            Ok(canonical) => {
                let mut out = canonical;
                for i = suffix.length() - 1; i >= 0; i = i - 1 {
                    out = out.join(suffix[i]);
                }
                return Some(out);
            }
            Err(_) => {
                let name = existing.file_name().map(|s| s.to_string_lossy().into_owned());
                if let Some(n) = name {
                    suffix.push(n);
                    if !existing.pop() {
                        return None;
                    }
                } else {
                    return None;
                }
            }
        }
    }
}

/// Resolve `raw` against the currently opened project root. See `resolve_against_root`.
fn resolve_within_root(app: &AppHandle, raw: &str) -> Result<PathBuf, String> {
    let root = project_root(app)?;
    resolve_against_root(&root, raw)
}

/// Enforce that `raw` is an absolute path pointing inside `root` — after resolving
/// symlinks in existing directories and `..` components — and return the path to
/// use for the actual filesystem IO (lexically normalized, so it also works for
/// files that do not exist yet, such as write targets).
fn resolve_against_root(root: &Path, raw: &str) -> Result<PathBuf, String> {
    let path = Path::new(raw);
    if !path.is_absolute() {
        return Err(format!("Path must be absolute: {raw}"));
    }
    let root_canonical = fs::canonicalize(root)
        .map_err(|e| format!(
            "Failed to resolve project folder {}: {e}",
            root.to_string_lossy().into_owned(),
        ))?;
    let normalized = normalize_lexical(path);
    let resolved = canonicalize_existing(&normalized)
        .ok_or_else(|| format!("Failed to resolve path: {raw}"))?;
    if !resolved.starts_with(&root_canonical) {
        return Err(format!("Path is outside the opened project folder: {raw}"));
    }
    Ok(normalized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Unique scratch dir under the system temp folder.
    fn temp_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("codelens_fs_{name}_{stamp}"))
    }

    #[test]
    fn normalizes_dot_and_dotdot_lexically() {
        assert_eq!(normalize_lexical(Path::new("/a/b/../c/./d")), PathBuf::from("/a/c/d"));
        assert_eq!(normalize_lexical(Path::new("a/../b")), PathBuf::from("b"));
    }

    #[test]
    fn rejects_relative_paths() {
        let root = temp_dir("rel");
        fs::create_dir_all(&root).unwrap();
        let err = resolve_against_root(&root, "src/main.rs").unwrap_err();
        assert!(err.contains("absolute"), "{err}");
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn accepts_files_inside_root() {
        let root = temp_dir("inside");
        fs::create_dir_all(root.join("src")).unwrap();
        let target = root.join("src/main.rs");
        fs::write(&target, "fn main() {}\n").unwrap();
        let resolved = resolve_against_root(&root, target.to_str().unwrap()).unwrap();
        assert_eq!(resolved, target);
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn accepts_write_targets_that_do_not_exist_yet() {
        let root = temp_dir("newfile");
        fs::create_dir_all(&root).unwrap();
        let target = root.join("deep/nested/new.rs");
        assert!(!target.exists());
        let resolved = resolve_against_root(&root, target.to_str().unwrap()).unwrap();
        assert!(resolved.ends_with(Path::new("deep/nested/new.rs")));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_dotdot_escapes() {
        let root = temp_dir("escape");
        fs::create_dir_all(&root).unwrap();
        for candidate in [
            root.join("../sibling/secret.txt"),
            root.join("src/../../../outside/secret.txt"),
        ] {
            assert!(
                resolve_against_root(&root, candidate.to_str().unwrap()).is_err(),
                "expected rejection for {candidate:?}",
            );
        }
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn rejects_unrelated_directory() {
        let root = temp_dir("root");
        let other = temp_dir("other");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&other).unwrap();
        fs::write(other.join("x.txt"), "x").unwrap();
        assert!(resolve_against_root(&root, other.join("x.txt").to_str().unwrap()).is_err());
        fs::remove_dir_all(&root).ok();
        fs::remove_dir_all(&other).ok();
    }
}