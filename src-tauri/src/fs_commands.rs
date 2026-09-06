//! Filesystem commands: open a project folder, read the tree, read/write files.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

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
#[tauri::command]
pub fn read_folder_tree(root: String) -> Result<TreeNode, String> {
    let path = PathBuf::from(&root);
    if !path.is_dir() {
        return Err(format!("Not a directory: {root}"));
    }
    build_tree(&path, 0).ok_or_else(|| format!("Failed to read folder: {root}"))
}

/// Read a file's UTF-8 text content.
#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {path}: {e}"))
}

/// Write text content to a file (creates/overwrites).
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write {path}: {e}"))
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