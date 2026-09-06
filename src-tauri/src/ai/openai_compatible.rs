//! Generic "OpenAI-compatible" provider.
//!
//! Speaks the same wire protocol as OpenAI's Chat Completions API, but lets
//! the user point it at any base URL: Ollama, LM Studio, OpenRouter, Groq,
//! local proxies, etc.

use super::openai::parse_payload;
use super::sse::collect_sse_payloads;
use super::{CompletionRequest, ProviderConfig, AIError, EmitFn};
use futures_util::StreamExt;
use serde_json::json;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

// Ollama's OpenAI-compatible endpoint defaults.
pub const DEFAULT_BASE_URL: &str = "http://localhost:11434/v1";
pub const DEFAULT_MODEL: &str = "llama3.2";

pub struct OpenAICompatibleProvider;

impl super::AIProvider for OpenAICompatibleProvider {
    fn id(&self) -> &'static str {
        super::PROVIDER_OPENAI_COMPATIBLE
    }

    fn stream_completion(
        &self,
        req: CompletionRequest,
        emit: EmitFn,
        cancel: Arc<AtomicBool>,
    ) -> Pin<Box<dyn Future<Output = Result<(), AIError>> + Send>> {
        Box::pin(async move {
            let base = req.config.base_url.trim_end_matches('/');
            if base.is_empty() {
                return Err(AIError::new(
                    "No base URL set for the OpenAI-compatible endpoint.",
                ));
            }
            let url = format!("{base}/chat/completions");

            let api_key = req.config.api_key.clone();
            let body = json!({
                "model": req.config.model,
                "messages": [
                    {"role": "system", "content": req.system_prompt},
                    {"role": "user", "content": req.user_prompt}
                ],
                "stream": true
            });

            let mut rb = super::http_client().post(&url).json(&body);
            if let Some(key) = &api_key {
                if !key.is_empty() {
                    rb = rb.bearer_auth(key);
                }
            }

            let resp = rb.send().await?;

            if !resp.status().is_success() {
                let status = resp.status().as_u16();
                let body = resp.text().await.unwrap_or_default();
                return Err(AIError::upstream("Compatible endpoint", status, body));
            }

            let mut stream = resp.bytes_stream();
            let mut buf: Vec<u8> = Vec::new();

            while let Some(chunk) = stream.next().await {
                if cancel.load(Ordering::Relaxed) {
                    return Err(AIError::cancelled());
                }
                let chunk = chunk?;
                for payload in collect_sse_payloads(&mut buf, &chunk) {
                    if payload == "[DONE]" {
                        return Ok(());
                    }
                    if let Some(tok) = parse_payload(&payload) {
                        emit(tok);
                    }
                }
            }

            Ok(())
        })
    }

    fn test_connection(
        &self,
        config: &ProviderConfig,
    ) -> Pin<Box<dyn Future<Output = Result<(), AIError>> + Send>> {
        let config = config.clone();
        Box::pin(async move {
            let base = config.base_url.trim_end_matches('/');
            if base.is_empty() {
                return Err(AIError::new(
                    "No base URL set for the OpenAI-compatible endpoint.",
                ));
            }
            let url = format!("{base}/chat/completions");

            let api_key = config.api_key.clone();
            let body = json!({
                "model": config.model,
                "messages": [{"role": "user", "content": super::test_prompt()}],
                "max_tokens": super::test_max_tokens()
            });

            let mut rb = super::http_client().post(&url).json(&body);
            if let Some(key) = &api_key {
                if !key.is_empty() {
                    rb = rb.bearer_auth(key);
                }
            }

            super::run_test("Compatible endpoint", rb, |v| v.get("choices").is_some()).await
        })
    }
}