//! Google (Gemini) provider — streaming via `streamGenerateContent` (SSE).

use super::sse::collect_sse_payloads;
use super::{CompletionRequest, ProviderConfig, TokenChunk, AIError, EmitFn};
use futures_util::StreamExt;
use serde_json::json;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub const DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com";
pub const DEFAULT_MODEL: &str = "gemini-2.0-flash";

pub struct GoogleProvider;

impl super::AIProvider for GoogleProvider {
    fn id(&self) -> &'static str {
        super::PROVIDER_GOOGLE
    }

    fn stream_completion(
        &self,
        req: CompletionRequest,
        emit: EmitFn,
        cancel: Arc<AtomicBool>,
    ) -> Pin<Box<dyn Future<Output = Result<(), AIError>> + Send>> {
        Box::pin(async move {
            let api_key = req.config.api_key.clone().ok_or_else(|| {
                AIError::new("No API key configured for Google. Add one in Settings → AI Providers.")
            })?;
            let base = req.config.base_url.trim_end_matches('/');
            let model = req.config.model.trim();
            let url = format!("{base}/v1beta/models/{model}:streamGenerateContent?alt=sse");

            // Both the file and the task are part of the single user turn.
            let body = json!({
                "contents": [{
                    "role": "user",
                    "parts": [
                        {"text": req.system_prompt},
                        {"text": req.user_prompt}
                    ]
                }],
                "generationConfig": {
                    "temperature": 0.4,
                    "maxOutputTokens": req.max_tokens
                }
            });

            let resp = super::http_client()
                .post(&url)
                .header("x-goog-api-key", &api_key)
                .json(&body)
                .send()
                .await?;

            if !resp.status().is_success() {
                let status = resp.status().as_u16();
                let body = resp.text().await.unwrap_or_default();
                return Err(AIError::upstream("Google", status, body));
            }

            let mut stream = resp.bytes_stream();
            let mut buf: Vec<u8> = Vec::new();

            while let Some(chunk) = stream.next().await {
                if cancel.load(Ordering::Relaxed) {
                    return Err(AIError::cancelled());
                }
                let chunk = chunk?;
                for payload in collect_sse_payloads(&mut buf, &chunk) {
                    if let Some(text) = extract_text(&payload) {
                        emit(TokenChunk { text });
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
            let model = config.model.trim();
            let url = format!("{base}/v1beta/models/{model}:generateContent");

            let body = json!({
                "contents": [{"role": "user", "parts": [{"text": super::test_prompt()}]}],
                "generationConfig": {"temperature": 0.0}
            });

            let send = super::http_client()
                .post(&url)
                .header("x-goog-api-key", &api_key)
                .json(&body);

            super::run_test("Google", send, |v| v.get("candidates").is_some()).await
        })
    }
}

fn extract_text(payload: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(payload).ok()?;
    let candidates = v.get("candidates")?.as_array()?;
    let parts = candidates.first()?.get("content")?.get("parts")?.as_array()?;
    let mut text = String::new();
    for part in parts {
        if let Some(t) = part.get("text").and_then(|t| t.as_str()) {
            text.push_str(t);
        }
    }
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

#[cfg(test)]
mod tests {
    use super::extract_text;

    #[test]
    fn parses_candidate_text() {
        let p = r#"{"candidates":[{"content":{"role":"model","parts":[{"text":"Hello "},{"text":"world"}]}}]}"#;
        assert_eq!(extract_text(p).as_deref(), Some("Hello world"));
    }

    #[test]
    fn ignores_empty_finish() {
        let p = r#"{"candidates":[{"finishReason":"STOP"}]}"#;
        assert!(extract_text(p).is_none());
    }
}