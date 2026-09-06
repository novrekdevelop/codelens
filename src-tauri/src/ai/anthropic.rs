//! Anthropic (Claude) provider — streaming via the Messages API.

use super::sse::collect_sse_payloads;
use super::{CompletionRequest, ProviderConfig, TokenChunk, AIError, EmitFn};
use futures_util::StreamExt;
use serde_json::json;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub const DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
pub const DEFAULT_MODEL: &str = "claude-sonnet-4-5";

pub struct AnthropicProvider;

impl super::AIProvider for AnthropicProvider {
    fn id(&self) -> &'static str {
        super::PROVIDER_ANTHROPIC
    }

    fn stream_completion(
        &self,
        req: CompletionRequest,
        emit: EmitFn,
        cancel: Arc<AtomicBool>,
    ) -> Pin<Box<dyn Future<Output = Result<(), AIError>> + Send>> {
        Box::pin(async move {
            let api_key = req.config.api_key.clone().ok_or_else(|| {
                AIError::new(
                    "No API key configured for Anthropic. Add one in Settings → AI Providers.",
                )
            })?;
            let base = req.config.base_url.trim_end_matches('/');
            let url = format!("{base}/v1/messages");

            let body = json!({
                "model": req.config.model,
                "max_tokens": req.max_tokens,
                "system": req.system_prompt,
                "stream": true,
                "messages": [{"role": "user", "content": req.user_prompt}]
            });

            let resp = super::http_client()
                .post(&url)
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await?;

            if !resp.status().is_success() {
                let status = resp.status().as_u16();
                let body = resp.text().await.unwrap_or_default();
                return Err(AIError::upstream("Anthropic", status, body));
            }

            let mut stream = resp.bytes_stream();
            let mut buf: Vec<u8> = Vec::new();

            while let Some(chunk) = stream.next().await {
                if cancel.load(Ordering::Relaxed) {
                    return Err(AIError::cancelled());
                }
                let chunk = chunk?;
                for payload in collect_sse_payloads(&mut buf, &chunk) {
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
            let api_key = config
                .api_key
                .clone()
                .ok_or_else(|| AIError::new("No API key provided for the test."))?;
            let base = config.base_url.trim_end_matches('/');
            let url = format!("{base}/v1/messages");

            let body = json!({
                "model": config.model,
                "max_tokens": super::test_max_tokens(),
                "messages": [{"role": "user", "content": super::test_prompt()}]
            });

            let send = super::http_client()
                .post(&url)
                .header("x-api-key", &api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body);

            super::run_test("Anthropic", send, |v| {
                v.get("content").is_some() || v.get("usage").is_some()
            })
            .await
        })
    }
}

fn parse_payload(payload: &str) -> Option<TokenChunk> {
    let v: serde_json::Value = serde_json::from_str(payload).ok()?;
    if v.get("type").and_then(|t| t.as_str()) == Some("content_block_delta") {
        let delta = &v["delta"];
        let dtype = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if dtype == "text_delta" {
            let text = delta.get("text").and_then(|t| t.as_str())?;
            return Some(TokenChunk {
                text: text.to_string(),
            });
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::parse_payload;

    #[test]
    fn parses_text_delta() {
        let p = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#;
        let tok = parse_payload(p).expect("should parse");
        assert_eq!(tok.text, "Hello");
    }

    #[test]
    fn ignores_other_events() {
        let p = r#"{"type":"message_start","message":{"id":"msg_1"}}"#;
        assert!(parse_payload(p).is_none());
    }
}