pub mod anthropic;
pub mod google;
pub mod openai;
pub mod openai_compatible;
pub mod sse;

use futures_util::Future;
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

/// Provider IDs recognized by the backend.
pub const PROVIDER_ANTHROPIC: &str = "anthropic";
pub const PROVIDER_OPENAI: &str = "openai";
pub const PROVIDER_GOOGLE: &str = "google";
pub const PROVIDER_OPENAI_COMPATIBLE: &str = "openai_compatible";

/// Default max output tokens for reasoning/code requests.
pub const DEFAULT_MAX_TOKENS: u32 = 4096;
/// Small budget used by the "Test connection" button.
const TEST_MAX_TOKENS: u32 = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    Anthropic,
    OpenAI,
    Google,
    OpenAICompatible,
}

impl ProviderKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            ProviderKind::Anthropic => PROVIDER_ANTHROPIC,
            ProviderKind::OpenAI => PROVIDER_OPENAI,
            ProviderKind::Google => PROVIDER_GOOGLE,
            ProviderKind::OpenAICompatible => PROVIDER_OPENAI_COMPATIBLE,
        }
    }
}

/// A provider configuration. The `api_key` is normally kept in the OS
/// credential store; it is only carried in memory while a call is in-flight.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub id: String,
    pub name: String,
    pub kind: ProviderKind,
    pub base_url: String,
    pub model: String,
    pub is_active: bool,
    pub has_api_key: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
}

impl ProviderConfig {
    pub fn new(kind: ProviderKind, name: String, base_url: String, model: String) -> Self {
        Self {
            id: kind.as_str().to_string(),
            name,
            kind,
            base_url,
            model,
            is_active: false,
            has_api_key: false,
            api_key: None,
        }
    }

    /// Obfuscated view of the key safe to send to the frontend.
    pub fn masked(mut self) -> Self {
        if self.has_api_key {
            self.api_key = Some("••••••••••••".to_string());
        } else {
            self.api_key = None;
        }
        self
    }
}

/// A single raw text chunk produced by a provider (streaming token fragment).
#[derive(Debug, Clone)]
pub struct TokenChunk {
    pub text: String,
}

/// Everything the reasoning pipeline needs to run one AI request.
#[derive(Debug, Clone)]
pub struct CompletionRequest {
    pub config: ProviderConfig,
    pub system_prompt: String,
    pub user_prompt: String,
    pub max_tokens: u32,
}

#[derive(Debug, Clone)]
pub struct AIError {
    pub message: String,
    pub cancelled: bool,
}

impl AIError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
            cancelled: false,
        }
    }

    pub fn cancelled() -> Self {
        Self {
            message: "Request cancelled".to_string(),
            cancelled: true,
        }
    }

    pub fn upstream(kind: &str, status: u16, body: String) -> Self {
        let snippet: String = body.chars().take(700).collect();
        Self::new(format!("{kind} API error (HTTP {status}): {snippet}"))
    }
}

impl std::fmt::Display for AIError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AIError {}

impl From<reqwest::Error> for AIError {
    fn from(e: reqwest::Error) -> Self {
        Self::new(format!("Network error: {e}"))
    }
}
/// Shared emitter used by providers to push tokens downstream.
pub type EmitFn = Arc<dyn Fn(TokenChunk) + Send + Sync>;

/// Common interface every AI provider implements so `reasoning_parser.rs`
/// always works on the same token stream regardless of the upstream API.
/// Methods return boxed futures so the trait is object-safe (`Box<dyn AIProvider>`).
pub trait AIProvider: Send + Sync {
    fn id(&self) -> &'static str;

    /// Stream the completion for `req`, calling `emit` for each text chunk as
    /// it arrives. Returns `Err(AIError::cancelled())` when `cancel` is set.
    fn stream_completion(
        &self,
        req: CompletionRequest,
        emit: EmitFn,
        cancel: Arc<AtomicBool>,
    ) -> Pin<Box<dyn Future<Output = Result<(), AIError>> + Send>>;

    /// Minimal non-streaming call used by the "Test connection" button.
    fn test_connection(
        &self,
        config: &ProviderConfig,
    ) -> Pin<Box<dyn Future<Output = Result<(), AIError>> + Send>>;
}

/// Build a shared HTTP client with reasonable timeouts.
pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .expect("failed to build HTTP client")
}

/// Max token budget for "Test connection" calls.
pub fn test_max_tokens() -> u32 {
    TEST_MAX_TOKENS
}

/// Content of the minimal prompt used by "Test connection" calls.
pub fn test_prompt() -> &'static str {
    "Reply with the single word: OK"
}

/// Factory that returns the correct provider implementation for an id.
pub fn provider_for(id: &str) -> Result<Box<dyn AIProvider>, AIError> {
    match id {
        PROVIDER_ANTHROPIC => Ok(Box::new(anthropic::AnthropicProvider)),
        PROVIDER_OPENAI => Ok(Box::new(openai::OpenAIProvider)),
        PROVIDER_GOOGLE => Ok(Box::new(google::GoogleProvider)),
        PROVIDER_OPENAI_COMPATIBLE => Ok(Box::new(openai_compatible::OpenAICompatibleProvider)),
        other => Err(AIError::new(format!("Unknown provider: {other}"))),
    }
}

/// Helper used by test_connection implementations: run a tiny non-streamed
/// completion and surface any upstream error.
pub async fn run_test(
    kind: &str,
    send: reqwest::RequestBuilder,
    extract_ok: impl FnOnce(&serde_json::Value) -> bool,
) -> Result<(), AIError> {
    let resp = send.send().await.map_err(|e| -> AIError { e.into() })?;
    let status = resp.status();
    let body = resp
        .text()
        .await
        .unwrap_or_else(|_| "<unreadable body>".to_string());
    if status.is_success() {
        let parsed: serde_json::Value =
            serde_json::from_str(&body).unwrap_or(serde_json::Value::Null);
        if extract_ok(&parsed) {
            Ok(())
        } else {
            Err(AIError::new(format!(
                "{kind}: the endpoint responded with HTTP {status} but the body was not a valid completion."
            )))
        }
    } else {
        Err(AIError::upstream(kind, status.as_u16(), body))
    }
}