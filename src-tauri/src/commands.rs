//! Orchestrates AI requests end-to-end:
//!   resolve the provider + key → spawn a streaming job → forward parsed
//!   reasoning/code events to the frontend in near real time via Tauri events.

use crate::ai::{provider_for, CompletionRequest, ProviderConfig, TokenChunk, AIError, EmitFn, DEFAULT_MAX_TOKENS};
use crate::providers_store;
use crate::reasoning_parser::{ParserEvent, ReasoningParser};
use crate::reasoning_prompt::{build_user_prompt, SYSTEM_PROMPT};
use crate::secure_store;
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;

// -- Event names (all payloads carry `request_id`) --------------------------
const EV_REASONING_TEXT: &str = "cl:reasoning_text";
const EV_ALT_BEGIN: &str = "cl:alt_begin";
const EV_ALT_TEXT: &str = "cl:alt_text";
const EV_ALT_END: &str = "cl:alt_end";
const EV_REF: &str = "cl:ref";
const EV_CODE_BEGIN: &str = "cl:code_begin";
const EV_CODE_TEXT: &str = "cl:code_text";
const EV_CODE_END: &str = "cl:code_end";
const EV_SESSION: &str = "cl:session";

// -- Event payloads ---------------------------------------------------------
#[derive(Debug, Clone, Serialize)]
struct TextPayload {
    request_id: String,
    text: String,
}

#[derive(Debug, Clone, Serialize)]
struct SimplePayload {
    request_id: String,
}

#[derive(Debug, Clone, Serialize)]
struct IndexPayload {
    request_id: String,
    index: u32,
}

#[derive(Debug, Clone, Serialize)]
struct AltTextPayload {
    request_id: String,
    index: u32,
    text: String,
}

#[derive(Debug, Clone, Serialize)]
struct RefPayload {
    request_id: String,
    line: u32,
}

#[derive(Debug, Clone, Serialize)]
struct SessionPayload {
    request_id: String,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AIRequestArgs {
    pub request_id: String,
    pub provider_id: String,
    pub file_path: String,
    pub file_content: String,
    pub task: String,
}

enum StreamMsg {
    Events(Vec<ParserEvent>),
    End(Result<(), AIError>),
}

/// A packet ready to be emitted to the frontend. Text variants can be merged
/// consecutively to reduce IPC traffic while keeping rendering token-fresh.
enum Pkt {
    Reasoning(String),
    AltBegin(u32),
    AltText(u32, String),
    AltEnd(u32),
    Ref(u32),
    CodeBegin,
    CodeText(String),
    CodeEnd,
}

/// Start an AI reasoning request. Resolves configuration synchronously, then
/// streams the response in the background, emitting Tauri events as tokens
/// are parsed. Returns the `request_id` immediately.
#[tauri::command]
pub async fn ai_request(app: AppHandle, args: AIRequestArgs) -> Result<String, String> {
    // Resolve the provider config with a fresh API key from the OS store.
    let mut config: ProviderConfig = providers_store::load_provider(&args.provider_id)
        .map_err(|e| e.to_string())?;
    let key = secure_store::get_api_key(&args.provider_id).map_err(|e| e.to_string())?;
    config.api_key = key.filter(|k| !k.is_empty());
    config.has_api_key = config.api_key.is_some();
    if config.api_key.is_none() {
        return Err(format!(
            "No API key for '{}'. Add one in Settings → AI Providers.",
            config.name
        ));
    }

    let provider = provider_for(&args.provider_id).map_err(|e| e.to_string())?;

    // Register a cancellation flag for this request.
    let cancel = Arc::new(AtomicBool::new(false));
    app.state::<AppState>()
        .jobs
        .write()
        .unwrap()
        .insert(args.request_id.clone(), cancel.clone());

    let req = CompletionRequest {
        config: config.clone(),
        system_prompt: SYSTEM_PROMPT.to_string(),
        user_prompt: build_user_prompt(&args.file_path, &args.file_content, &args.task),
        max_tokens: DEFAULT_MAX_TOKENS,
    };

    let app2 = app.clone();
    let rid = args.request_id.clone();
    tauri::async_runtime::spawn(async move {
        run_streaming_job(app2, provider, req, rid, cancel).await;
    });

    Ok(args.request_id)
}

/// Ask the backend to stop the given request at the next streaming boundary.
#[tauri::command]
pub fn cancel_request(app: AppHandle, request_id: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    if let Some(flag) = state.jobs.read().unwrap().get(&request_id) {
        flag.store(true, Ordering::Relaxed);
    }
    Ok(())
}
async fn run_streaming_job(
    app: AppHandle,
    provider: Box<dyn crate::ai::AIProvider>,
    req: CompletionRequest,
    request_id: String,
    cancel: Arc<AtomicBool>,
) {
    let _ = app.emit(
        EV_SESSION,
        SessionPayload {
            request_id: request_id.clone(),
            status: "started".to_string(),
            error: None,
            model: Some(req.config.model.clone()),
        },
    );

    let (tx, rx) = mpsc::unbounded_channel::<StreamMsg>();
    let parser = Arc::new(Mutex::new(ReasoningParser::new()));

    // Provider callback: feed raw chunks into the parser and forward the
    // resulting events to the flusher. Runs synchronously inside the
    // provider's streaming loop.
    let emit_tx = tx.clone();
    let emit_parser = parser.clone();
    let emit: EmitFn = Arc::new(move |chunk: TokenChunk| {
        let events = emit_parser
            .lock()
            .expect("parser mutex poisoned")
            .feed(&chunk.text);
        if !events.is_empty() {
            let _ = emit_tx.send(StreamMsg::Events(events));
        }
    });

    // Flusher: reconnect the event stream to the frontend with light batching.
    let flusher = {
        let app = app.clone();
        let request_id = request_id.clone();
        tokio::spawn(async move {
            flush_loop(&app, &request_id, rx).await;
        })
    };

    let result = provider.stream_completion(req, emit, cancel.clone()).await;

    // Flush anything still held inside the parser (unclosed tags etc.).
    let tail = parser.lock().expect("parser mutex poisoned").finish();
    if !tail.is_empty() {
        let _ = tx.send(StreamMsg::Events(tail));
    }

    match result {
        Ok(()) => {
            let _ = tx.send(StreamMsg::End(Ok(())));
        }
        Err(e) => {
            let _ = tx.send(StreamMsg::End(Err(e)));
        }
    }
    drop(tx);

    let _ = flusher.await;

    // Unregister the cancellation flag.
    let state = app.state::<AppState>();
    state.jobs.write().unwrap().remove(&request_id);
}
async fn flush_loop(
    app: &AppHandle,
    request_id: &str,
    mut rx: mpsc::UnboundedReceiver<StreamMsg>,
) {
    let mut pending: Vec<Pkt> = Vec::new();
    let mut last_flush = Instant::now();
    const MIN_EVENTS: usize = 14;
    const MAX_LATENCY: Duration = Duration::from_millis(10);

    while let Some(msg) = rx.recv().await {
        match msg {
            StreamMsg::Events(events) => {
                push_packets(&mut pending, events);
                if pending.len() >= MIN_EVENTS || last_flush.elapsed() >= MAX_LATENCY {
                    emit_all(app, request_id, &mut pending);
                    last_flush = Instant::now();
                }
            }
            StreamMsg::End(result) => {
                emit_all(app, request_id, &mut pending);
                let payload = match result {
                    Ok(()) => SessionPayload {
                        request_id: request_id.to_string(),
                        status: "finished".to_string(),
                        error: None,
                        model: None,
                    },
                    Err(e) if e.cancelled => SessionPayload {
                        request_id: request_id.to_string(),
                        status: "cancelled".to_string(),
                        error: None,
                        model: None,
                    },
                    Err(e) => SessionPayload {
                        request_id: request_id.to_string(),
                        status: "error".to_string(),
                        error: Some(e.message),
                        model: None,
                    },
                };
                let _ = app.emit(EV_SESSION, payload);
                break;
            }
        }
    }
}
fn push_packets(pending: &mut Vec<Pkt>, events: Vec<ParserEvent>) {
    for event in events {
        let pkt = match event {
            ParserEvent::Text(t) => Pkt::Reasoning(t),
            ParserEvent::AltBegin(i) => Pkt::AltBegin(i),
            ParserEvent::AltText(i, t) => Pkt::AltText(i, t),
            ParserEvent::AltEnd(i) => Pkt::AltEnd(i),
            ParserEvent::Ref(l) => Pkt::Ref(l),
            ParserEvent::CodeBegin => Pkt::CodeBegin,
            ParserEvent::CodeText(t) => Pkt::CodeText(t),
            ParserEvent::CodeEnd => Pkt::CodeEnd,
        };
        // Merge consecutive fragments of the same textual kind.
        let merged = match (&mut pending.last_mut(), &pkt) {
            (Some(Pkt::Reasoning(a)), Pkt::Reasoning(b)) => {
                a.push_str(b);
                true
            }
            (Some(Pkt::AltText(i1, a)), Pkt::AltText(i2, b)) if i1 == i2 => {
                a.push_str(b);
                true
            }
            (Some(Pkt::CodeText(a)), Pkt::CodeText(b)) => {
                a.push_str(b);
                true
            }
            _ => false,
        };
        if !merged {
            pending.push(pkt);
        }
    }
}

fn emit_all(app: &AppHandle, request_id: &str, pending: &mut Vec<Pkt>) {
    for pkt in pending.drain(..) {
        let rid = request_id.to_string();
        match pkt {
            Pkt::Reasoning(text) => {
                let _ = app.emit(EV_REASONING_TEXT, TextPayload { request_id: rid, text });
            }
            Pkt::AltBegin(index) => {
                let _ = app.emit(EV_ALT_BEGIN, IndexPayload { request_id: rid, index });
            }
            Pkt::AltText(index, text) => {
                let _ = app.emit(EV_ALT_TEXT, AltTextPayload { request_id: rid, index, text });
            }
            Pkt::AltEnd(index) => {
                let _ = app.emit(EV_ALT_END, IndexPayload { request_id: rid, index });
            }
            Pkt::Ref(line) => {
                let _ = app.emit(EV_REF, RefPayload { request_id: rid, line });
            }
            Pkt::CodeBegin => {
                let _ = app.emit(EV_CODE_BEGIN, SimplePayload { request_id: rid });
            }
            Pkt::CodeText(text) => {
                let _ = app.emit(EV_CODE_TEXT, TextPayload { request_id: rid, text });
            }
            Pkt::CodeEnd => {
                let _ = app.emit(EV_CODE_END, SimplePayload { request_id: rid });
            }
        }
    }
}