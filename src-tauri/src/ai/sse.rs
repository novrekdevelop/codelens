//! Minimal SSE line-splitting helpers shared by every provider.
//!
//! We deliberately avoid pulling in a full SSE crate: providers stream
//! `data:` lines and nothing else is needed for Anthropic / OpenAI / Google
//! compatible endpoints.

/// Incrementally split incoming bytes into complete `data:` payload strings.
/// `buf` holds leftover bytes from previous calls. Only lines starting with
/// `data:` and followed by a non-empty value yield a payload.
pub fn collect_sse_payloads(buf: &mut Vec<u8>, incoming: &[u8]) -> Vec<String> {
    buf.extend_from_slice(incoming);
    let mut payloads = Vec::new();
    let mut consumed = 0usize;

    while let Some(pos) = buf[consumed..].iter().position(|&b| b == b'\n') {
        let end = consumed + pos;
        let line = &buf[consumed..end];
        consumed = end + 1;

        // Strip a leading \r (CRLF line endings).
        let line = if line.ends_with(b"\r") {
            &line[..line.len() - 1]
        } else {
            line
        };

        if let Some(data) = line.strip_prefix(b"data:") {
            let data = data.strip_prefix(b" ").unwrap_or(data);
            let s = String::from_utf8_lossy(data).into_owned();
            if !s.is_empty() && !s.starts_with('[') {
                payloads.push(s);
            }
            // `data: [DONE]` marks the end of OpenAI-style streams; ignore it.
        }
        // Other lines (event:, id:, blank) are ignored.
    }

    buf.drain(..consumed);
    payloads
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_simple_data_lines() {
        let mut buf = Vec::new();
        let payloads = collect_sse_payloads(&mut buf, b"data: {\"a\":1}\n\n");
        assert_eq!(payloads, vec!["{\"a\":1}"]);
        assert!(buf.is_empty());
    }

    #[test]
    fn handles_partial_chunks() {
        let mut buf = Vec::new();
        let mut all = Vec::new();
        all.extend(collect_sse_payloads(&mut buf, b"data: hello wor"));
        all.extend(collect_sse_payloads(&mut buf, b"ld\ndata: {\"b\":2}\n"));
        assert_eq!(all, vec!["hello world", "{\"b\":2}"]);
    }

    #[test]
    fn strips_carriage_returns() {
        let mut buf = Vec::new();
        let payloads = collect_sse_payloads(&mut buf, b"data: ok\r\n\r\n");
        assert_eq!(payloads, vec!["ok"]);
    }
}