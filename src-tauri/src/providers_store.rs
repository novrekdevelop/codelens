//! Persistence of provider *configurations* (never API keys — those live in
//! the OS credential store via `secure_store`) plus the Tauri commands the
//! Settings → AI Providers screen calls.

use crate::ai::anthropic;
use crate::ai::google;
use crate::ai::openai;
use crate::ai::openai_compatible;
use crate::ai::{ProviderConfig, ProviderKind, AIError};
use crate::secure_store;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const STORE_FILE: &str = "providers.json";
const MASKED_KEY: &str = "••••••••••••";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct ProviderStore {
    providers: Vec<ProviderConfig>,
}

/// The app config directory. `CODELENS_CONFIG_DIR` overrides it (handy for
/// tests and portable builds); otherwise it is per-OS:
/// Windows:  %APPDATA%\codelens
/// macOS:    ~/Library/Application Support/codelens
/// Linux:    ~/.config/codelens
fn app_config_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("CODELENS_CONFIG_DIR") {
        return PathBuf::from(dir);
    }
    #[cfg(target_os = "windows")]
    {
        if let Some(appdata) = std::env::var_os("APPDATA") {
            return PathBuf::from(appdata).join("codelens");
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        #[cfg(target_os = "macos")]
        {
            return PathBuf::from(home).join("Library/Application Support/codelens");
        }
        #[cfg(not(target_os = "macos"))]
        {
            return PathBuf::from(home).join(".config/codelens");
        }
    }
    PathBuf::from(".")
}

fn store_path() -> PathBuf {
    app_config_dir().join(STORE_FILE)
}

fn load_store() -> ProviderStore {
    let raw = fs::read_to_string(store_path()).unwrap_or_else(|_| "{}".to_string());
    serde_json::from_str(&raw).unwrap_or_default()
}

fn save_store(store: &ProviderStore) -> Result<(), String> {
    let dir = app_config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {e}"))?;
    let json = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize provider config: {e}"))?;
    fs::write(store_path(), json).map_err(|e| format!("Failed to write provider config: {e}"))
}

fn parse_kind(kind: &str) -> Option<ProviderKind> {
    match kind {
        "anthropic" => Some(ProviderKind::Anthropic),
        "openai" => Some(ProviderKind::OpenAI),
        "google" => Some(ProviderKind::Google),
        "openai_compatible" => Some(ProviderKind::OpenAICompatible),
        _ => None,
    }
}

/// Load the persisted config for a provider id (used by the AI request path).
pub fn load_provider(id: &str) -> Result<ProviderConfig, AIError> {
    load_store()
        .providers
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| AIError::new(format!("Provider '{id}' is not configured.")))
}

/// Load the *active* provider config. Errors if none is marked active.
pub fn load_active_provider() -> Result<ProviderConfig, AIError> {
    load_store()
        .providers
        .into_iter()
        .find(|p| p.is_active)
        .ok_or_else(|| AIError::new("No active provider. Pick one in Settings → AI Providers."))
}

/// Create the default provider list on first ever launch.
pub fn ensure_default_configs() -> Result<(), Box<dyn std::error::Error>> {
    if store_path().exists() {
        return Ok(());
    }
    let mut store = ProviderStore::default();
    store.providers.push(ProviderConfig::new(
        ProviderKind::Anthropic,
        "Anthropic (Claude)".to_string(),
        anthropic::DEFAULT_BASE_URL.to_string(),
        anthropic::DEFAULT_MODEL.to_string(),
    ));
    store.providers.push(ProviderConfig::new(
        ProviderKind::OpenAI,
        "OpenAI (GPT)".to_string(),
        openai::DEFAULT_BASE_URL.to_string(),
        openai::DEFAULT_MODEL.to_string(),
    ));
    store.providers.push(ProviderConfig::new(
        ProviderKind::Google,
        "Google (Gemini)".to_string(),
        google::DEFAULT_BASE_URL.to_string(),
        google::DEFAULT_MODEL.to_string(),
    ));
    store.providers.push(ProviderConfig::new(
        ProviderKind::OpenAICompatible,
        "OpenAI-compatible endpoint".to_string(),
        openai_compatible::DEFAULT_BASE_URL.to_string(),
        openai_compatible::DEFAULT_MODEL.to_string(),
    ));
    save_store(&store)?;
    Ok(())
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProviderArgs {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
    pub make_active: bool,
}

/// The provider list, each with masked keys, as shown in Settings.
#[tauri::command]
pub fn list_provider_configs() -> Result<Vec<ProviderConfig>, String> {
    let mut store = load_store();
    for p in store.providers.iter_mut() {
        p.has_api_key = secure_store::api_key_exists(&p.id);
    }
    Ok(store
        .providers
        .into_iter()
        .map(|p| p.masked())
        .collect())
}

/// Save a provider configuration. A real (non-masked) `api_key` in the args
/// is persisted to the OS credential store; the config file never sees it.
#[tauri::command]
pub fn save_provider_config(args: SaveProviderArgs) -> Result<(), String> {
    let kind = parse_kind(&args.kind).ok_or_else(|| format!("Unknown provider kind: {}", args.kind))?;
    let mut store = load_store();

    match store.providers.iter_mut().find(|p| p.id == args.id) {
        Some(p) => {
            p.name = args.name;
            p.kind = kind;
            p.base_url = args.base_url;
            p.model = args.model;
        }
        None => {
            store.providers.push(ProviderConfig {
                id: args.id.clone(),
                name: args.name,
                kind,
                base_url: args.base_url,
                model: args.model,
                is_active: false,
                has_api_key: false,
                api_key: None,
            });
        }
    }

    if args.make_active {
        for p in store.providers.iter_mut() {
            p.is_active = p.id == args.id;
        }
    }

    let new_key = args
        .api_key
        .as_deref()
        .filter(|k| !k.is_empty() && *k != MASKED_KEY);
    if let Some(key) = new_key {
        secure_store::save_api_key(&args.id, key).map_err(|e| e.to_string())?;
        if let Some(p) = store.providers.iter_mut().find(|p| p.id == args.id) {
            p.has_api_key = true;
        }
    }

    save_store(&store)
}

/// Delete a provider and its stored credential.
#[tauri::command]
pub fn delete_provider_config(id: String) -> Result<(), String> {
    let mut store = load_store();
    store.providers.retain(|p| p.id != id);
    let _ = secure_store::delete_api_key(&id);
    let had_active = store.providers.iter().any(|p| p.is_active);
    if !had_active {
        if let Some(first) = store.providers.first_mut() {
            first.is_active = true;
        }
    }
    save_store(&store)
}

/// Mark one provider as the active one for AI requests.
#[tauri::command]
pub fn set_active_provider(id: String) -> Result<(), String> {
    let mut store = load_store();
    let mut found = false;
    for p in store.providers.iter_mut() {
        if p.id == id {
            p.is_active = true;
            found = true;
        } else {
            p.is_active = false;
        }
    }
    if !found {
        return Err(format!("Provider '{id}' not found."));
    }
    save_store(&store)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionArgs {
    pub id: String,
    pub kind: String,
    pub base_url: String,
    pub model: String,
    pub api_key: Option<String>,
}

/// Validate a provider's key + endpoint with a minimal non-streaming call.
#[tauri::command]
pub async fn test_provider_connection(args: TestConnectionArgs) -> Result<String, String> {
    let kind = parse_kind(&args.kind).ok_or_else(|| format!("Unknown provider kind: {}", args.kind))?;

    let key = args
        .api_key
        .as_deref()
        .filter(|k| !k.is_empty() && *k != MASKED_KEY)
        .map(|k| k.to_string())
        .or(secure_store::get_api_key(&args.id).ok().flatten());

    let config = ProviderConfig {
        id: args.id.clone(),
        name: args.id.clone(),
        kind,
        base_url: args.base_url,
        model: args.model,
        is_active: false,
        has_api_key: key.is_some(),
        api_key: key,
    };

    if config.api_key.is_none() {
        return Err("No API key available. Paste one in the form or save the provider first.".into());
    }

    let provider = crate::ai::provider_for(&args.id).map_err(|e| e.to_string())?;
    provider.test_connection(&config).await.map_err(|e| e.to_string())?;
    Ok(format!("Connected — key and endpoint are valid."))
}