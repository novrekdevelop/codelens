//! API key storage in the operating system's native credential store
//! (Windows Credential Manager via the `keyring` crate).
//!
//! Keys are never written to config files, never logged, and never sent
//! anywhere except the provider the user chose.

use crate::ai::AIError;

/// Namespace used for every entry so CodeLens keys never collide with other
/// applications' credentials.
const SERVICE: &str = "com.codelens.app";

fn entry(provider_id: &str) -> Result<keyring::Entry, AIError> {
    keyring::Entry::new(SERVICE, provider_id)
        .map_err(|e| AIError::new(format!("Credential store unavailable: {e}")))
}

/// Persist an API key for a provider in the OS credential store.
pub fn save_api_key(provider_id: &str, api_key: &str) -> Result<(), AIError> {
    entry(provider_id)?
        .set_password(api_key)
        .map_err(|e| AIError::new(format!("Failed to store API key: {e}")))
}

/// Read the API key for a provider. Returns `Ok(None)` when none is stored.
pub fn get_api_key(provider_id: &str) -> Result<Option<String>, AIError> {
    match entry(provider_id)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AIError::new(format!("Failed to read API key: {e}"))),
    }
}

/// True when a key is stored for the provider (without reading it).
pub fn api_key_exists(provider_id: &str) -> bool {
    match entry(provider_id) {
        Ok(e) => e.get_password().is_ok(),
        Err(_) => false,
    }
}

/// Remove the stored key for a provider (idempotent).
pub fn delete_api_key(provider_id: &str) -> Result<(), AIError> {
    match entry(provider_id)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AIError::new(format!("Failed to delete API key: {e}"))),
    }
}