mod ai;
mod commands;
mod fs_commands;
mod providers_store;
mod reasoning_parser;
mod reasoning_prompt;
mod secure_store;

use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Shared application state.
pub struct AppState {
    /// provider_id -> cancellation flag for in-flight AI requests
    pub jobs: RwLock<HashMap<String, Arc<std::sync::atomic::AtomicBool>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            jobs: RwLock::new(HashMap::new()),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::ai_request,
            commands::cancel_request,
            providers_store::list_provider_configs,
            providers_store::save_provider_config,
            providers_store::delete_provider_config,
            providers_store::set_active_provider,
            providers_store::test_provider_connection,
            fs_commands::open_folder_dialog,
            fs_commands::read_folder_tree,
            fs_commands::read_file,
            fs_commands::write_file,
            fs_commands::pick_save_file,
        ])
        .setup(|_app| {
            // Make sure default provider scaffolding exists on first run.
            providers_store::ensure_default_configs()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running CodeLens");
}