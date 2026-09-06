//! OpenAI (GPT) provider — streaming via Chat Completions.

use super::sse::collect_sse_payloads;
use super::{CompletionRequest, ProviderConfig, TokenChunk, AIError, EmitFn};
use futures_util::StreamExt;
use serde_json::json;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub const DEFAULT_BASE_URL: &str = "https://api.openai.com/v1";
pub const DEFAULT_MODEL: &str = "gpt-4o";

pub struct OpenAIProvider;

impl super::AIProvider for OpenAIProvider {
    fn id(&self) -> &'static str {
        super::PROVIDER_OPENAI
    }

    fn stream_completion(
        &self,
        req: CompletionRequest,
        emit: EmitFn,
        cancel: Arc<AtomicBool>,
    ) -> Pin<Box<dyn Future<Output = Result<(), AIError>> + Send>> {
        Box::pin(async move {
            let api_key = req.config.api_key.clone().ok_or_else(|| {
                AIError::new("No API key configured for OpenAI. Add one in Settings → AI Providers.")
            })?;
            let base = req.config.base_url.trim_end_matches('/');
            let url = format!("{base}/chat/completions");

            let body = json!({
                "model": req.config.model,
                "messages": [
                    {"role": "system", "content": req.system_prompt},
                    {"role": "user", "content": req.user_prompt}
                ],
                "stream": true,
                "stream_options": {"include_usage": true}
            });

            let resp = super::http_client()
                .post(&url)
                .bearer_auth(&api_key)
                .json(&body)
                .send()
                .await?;

            if !resp.status().is_success() {
                let status = resp.status().as_u16();
                let body = resp.text().await.unwrap_or_default();
                return Err(AIError::upstream("OpenAI", status, body));
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
            let api_key = config
                .api_key
                .clone()
                .ok_or_else(|| AIError::new("No API key provided for the test."))?;
            let base = config.base_url.trim_end_matches('/');
            let url = format!("{base}/chat/completions");

            let body = json!({
                "model": config.model,
                "messages": [{"role": "user", "content": super::test_prompt()}],
                "max_tokens": super::test_max_tokens()
            });

            let send = super::http_client()
                .post(&url)
                .bearer_auth(&api_key)
                .json(&body);

            super::run_test("OpenAI", send, |v| v.get("choices").is_some()).await
        })
    }
}

pub fn parse_payload(payload: &str) -> Option<TokenChunk> {
    let v: serde_json::Value = serde_json::from_str(payload).ok()?;
    let choices = v.get("choices")?.as_array()?;
    let choice = choices.first()?;
    let content = choice
        .get("delta")?
        .get("content")
        .and_then(|c| c.as_str())?;
    if content.is_empty() {
        return None;
    }
    Some(TokenChunk {
        text: content.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::parse_payload;

    #[test]
    fn parses_choice_delta() {
        let p = r#"{"id":"chatcmpl-1","choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}"#;
        let tok = parse_payload(p).expect("should parse");
        assert_eq!(tok.text, "Hi");
    }

    #[test]
    fn ignores_final_chunk() {
        let p = r#"{"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#;
        assert!(parse_payload(p).is_none());
    }
}