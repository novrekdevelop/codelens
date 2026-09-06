//! Incremental, provider-independent parser for the `<reasoning>/<code>`
//! stream CodeLens requests from the model.
//!
//! The parser must work on *partial* token streams: `feed()` is called with
//! arbitrary chunks of text as they arrive and returns any completed events
//! (reasoning text, alternatives, code-line references, code fragments).
//!
//! Recognized structure:
//!
//! ```text
//! <reasoning>
//!   ...text with <ref>12</ref> line references and <alt>...</alt> blocks...
//! </reasoning>
//! <code>
//!   ...the full replacement file...
//! </code>
//! ```

const MAX_TAG_PROBE: usize = 64;

#[derive(Debug, Clone, PartialEq)]
pub enum ParserEvent {
    /// Plain reasoning text.
    Text(String),
    AltBegin(u32),
    AltText(u32, String),
    AltEnd(u32),
    /// A code-line reference resolved to a 1-based line number.
    Ref(u32),
    /// Entering the `<code>` section.
    CodeBegin,
    CodeText(String),
    CodeEnd,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Section {
    Before,
    Reasoning,
    Alt(u32),
    RefBuffered,
    Code,
}

#[derive(Debug)]
pub struct ReasoningParser {
    section: Section,
    /// Parent section to return to when a `<ref>` closes (Reasoning or Alt).
    ref_parent: Section,
    /// Work buffer of characters waiting for a tag to close (`>`).
    work: String,
    ref_buf: String,
    alt_counter: u32,
}

impl ReasoningParser {
    pub fn new() -> Self {
        Self {
            section: Section::Before,
            ref_parent: Section::Reasoning,
            work: String::new(),
            ref_buf: String::new(),
            alt_counter: 0,
        }
    }

    /// Feed a chunk of the raw model output; returns completed events.
    pub fn feed(&mut self, text: &str) -> Vec<ParserEvent> {
        self.work.push_str(text);
        let mut out = Vec::new();
        loop {
            if let Some(next) = self.process_one(&mut out) {
                if !next {
                    break;
                }
            } else {
                break;
            }
        }
        out
    }

    /// Returns `Some(false)` when more input is needed before anything else
    /// can be classified (e.g. a `<` with no closing `>` yet), otherwise
    /// `Some(true)` if progress could be made without new input.
    fn process_one(&mut self, out: &mut Vec<ParserEvent>) -> Option<bool> {
        // -- Code section: only care about `</code>`. -------------------------
        if self.section == Section::Code {
            if self.work.is_empty() {
                return Some(false);
            }
            if let Some(pos) = self.work.find("</code>") {
                let before = &self.work[..pos];
                let rest = &self.work[pos + "</code>".len()..];
                if !before.is_empty() {
                    out.push(ParserEvent::CodeText(before.to_string()));
                }
                out.push(ParserEvent::CodeEnd);
                self.work = rest.to_string();
                self.section = Section::Before; // finished
                return Some(true);
            }
            let all = std::mem::take(&mut self.work);
            if !all.is_empty() {
                out.push(ParserEvent::CodeText(all.clone()));
            }
            self.work = all;
            return Some(false);
        }

        // -- Tagged sections: scan for the next '<'. --------------------------
        if self.work.is_empty() {
            return Some(false);
        }
        let open = match self.work.find('<') {
            Some(i) => i,
            None => {
                // No tags at all: everything is plain text of the current section.
                let all = std::mem::take(&mut self.work);
                self.push_text(all, out);
                return Some(false);
            }
        };

        // Text before the '<' belongs to the current section.
        if open > 0 {
            let pre = self.work[..open].to_string();
            let rest = self.work[open..].to_string();
            self.push_text(pre, out);
            self.work = rest;
            return Some(true);
        }

        // Find the closing '>' for the tag.
        let close = self.work.find('>');
        let tag_end = match close {
            Some(c) => c,
            None => {
                // Pending tag may be truncated across chunks.
                if self.work.len() >= MAX_TAG_PROBE {
                    // Likely literal '<' in prose/code; emit and continue.
                    self.work.remove(0);
                    self.push_text("<".to_string(), out);
                    return Some(true);
                }
                return Some(false); // wait for more input
            }
        };

        let tag = self.work[1..tag_end].to_string();
        let rest = self.work[tag_end + 1..].to_string();
        self.work = rest;
        self.dispatch_tag(&tag, out);
        Some(true)
    }
/// Emit text for the *current* section.
    fn push_text(&mut self, text: String, out: &mut Vec<ParserEvent>) {
        if text.is_empty() {
            return;
        }
        match self.section {
            Section::Before | Section::Reasoning => out.push(ParserEvent::Text(text)),
            Section::Alt(id) => out.push(ParserEvent::AltText(id, text)),
            Section::RefBuffered => self.ref_buf.push_str(&text),
            Section::Code => out.push(ParserEvent::CodeText(text)),
        }
    }

    fn dispatch_tag(&mut self, raw: &str, out: &mut Vec<ParserEvent>) {
        let trimmed = raw.trim();
        let is_closing = trimmed.starts_with('/');
        // Normalize to lower-case, strip attributes (`<alt reason="...">`) and
        // a leading slash for closing tags.
        let lower = trimmed.trim_start_matches('/').to_ascii_lowercase();
        let name = lower
            .split(|c: char| c == ' ' || c == '\t')
            .next()
            .unwrap_or("")
            .trim()
            .to_string();

        match (is_closing, name.as_str()) {
            (false, "" | "reasoning") if matches!(self.section, Section::Before) => {
                self.section = Section::Reasoning;
            }
            (true, "reasoning") => {
                // `</reasoning>` — return to the pre-reasoning state; the
                // following `<code>` opens the code section anyway.
                if let Section::Alt(current) = self.section {
                    out.push(ParserEvent::AltEnd(current));
                }
                self.section = Section::Before;
            }
            (false, "alt") if self.section == Section::Reasoning => {
                self.alt_counter += 1;
                out.push(ParserEvent::AltBegin(self.alt_counter));
                self.section = Section::Alt(self.alt_counter);
            }
            (false, "alt") if let Section::Alt(current) = self.section => {
                // A stray opening `<alt>` inside an alt: close the current one
                // first, then open the next.
                out.push(ParserEvent::AltEnd(current));
                self.alt_counter = current.max(self.alt_counter);
                self.alt_counter += 1;
                out.push(ParserEvent::AltBegin(self.alt_counter));
                self.section = Section::Alt(self.alt_counter);
            }
            (false, "alt") => {
                // `<alt>` outside reasoning (before <reasoning>) — tolerate.
                if self.section == Section::Before {
                    self.section = Section::Reasoning;
                }
            }
            (true, "alt") => {
                if let Section::Alt(current) = self.section {
                    out.push(ParserEvent::AltEnd(current));
                    self.section = Section::Reasoning;
                }
            }
            (false, "ref") if matches!(self.section, Section::Reasoning | Section::Alt(_)) => {
                self.ref_parent = self.section;
                self.ref_buf.clear();
                self.section = Section::RefBuffered;
            }
            (true, "ref") if self.section == Section::RefBuffered => {
                let buf = std::mem::take(&mut self.ref_buf);
                self.emit_refs(&buf, out);
                self.section = self.ref_parent;
            }
            (false, "code")
                if matches!(
                    self.section,
                    Section::Reasoning | Section::Alt(_) | Section::Before
                ) =>
            {
                // Closing any dangling alternative before switching to code.
                if let Section::Alt(current) = self.section {
                    out.push(ParserEvent::AltEnd(current));
                }
                out.push(ParserEvent::CodeBegin);
                self.section = Section::Code;
            }
            _ => {
                // Unknown or redundancy tag: treat as literal text.
                self.push_text(format!("<{raw}>"), out);
            }
        }
    }

    /// Called at end-of-stream to flush any open sections.
    pub fn finish(&mut self) -> Vec<ParserEvent> {
        let mut out = Vec::new();
        match self.section {
            Section::Code => {
                if !self.work.is_empty() {
                    out.push(ParserEvent::CodeText(std::mem::take(&mut self.work)));
                }
                out.push(ParserEvent::CodeEnd);
            }
            Section::RefBuffered => {
                let buf = std::mem::take(&mut self.ref_buf);
                self.emit_refs(&buf, &mut out);
                self.section = self.ref_parent;
            }
            Section::Alt(id) => {
                if !self.work.is_empty() {
                    out.push(ParserEvent::AltText(id, std::mem::take(&mut self.work)));
                }
                out.push(ParserEvent::AltEnd(id));
            }
            Section::Reasoning | Section::Before => {
                if !self.work.is_empty() {
                    out.push(ParserEvent::Text(std::mem::take(&mut self.work)));
                }
            }
        }
        self.section = Section::Before;
        out
    }

    /// Convert the `<ref>` buffer to Ref events.
    fn emit_refs(&mut self, buf: &str, out: &mut Vec<ParserEvent>) {
        let numbers: Vec<u32> = buf
            .split(|c: char| !c.is_ascii_digit())
            .filter_map(|s| s.parse::<u32>().ok())
            .collect();
        if numbers.is_empty() {
            return;
        }
        // Deduplicate, cap at 4 refs per tag.
        let mut seen = Vec::new();
        for n in numbers {
            if n == 0 {
                continue;
            }
            if !seen.contains(&n) {
                seen.push(n);
            }
            if seen.len() >= 4 {
                break;
            }
        }
        for n in seen {
            out.push(ParserEvent::Ref(n));
        }
    }
}

impl Default for ReasoningParser {
    fn default() -> Self {
        Self::new()
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    fn collect(chunks: &[&str]) -> Vec<ParserEvent> {
        let mut parser = ReasoningParser::new();
        let mut out = Vec::new();
        for c in chunks {
            out.extend(parser.feed(c));
        }
        out.extend(parser.finish());
        out
    }

    #[test]
    fn parses_full_stream() {
        let events = collect(&[
            "<reasoning>The helper at <ref>18</ref> is slow. ",
            "<alt>Do it in Rust</alt>",
            "<alt>Keep JS, add caching</alt>",
            "I chose the second. <ref>41</ref> ",
            "</reasoning><code>line1\nline2</code>",
        ]);

        let mut refs = Vec::new();
        let mut alt_events = 0usize;
        let mut code = String::new();
        let mut saw_code_begin = false;
        for e in &events {
            match e {
                ParserEvent::Ref(n) => refs.push(*n),
                ParserEvent::AltBegin(_) | ParserEvent::AltEnd(_) => alt_events += 1,
                ParserEvent::CodeBegin => saw_code_begin = true,
                ParserEvent::CodeText(t) => code.push_str(t),
                _ => {}
            }
        }
        assert_eq!(refs, vec![18, 41]);
        assert_eq!(alt_events, 4); // begin + end for each alternative
        assert!(saw_code_begin);
        assert!(code.contains("line1"));
        assert!(events.iter().any(|e| matches!(e, ParserEvent::CodeEnd)));
    }

    #[test]
    fn handles_token_splits() {
        let full = "<reasoning>see <ref>7</ref></reasoning><code>x</code>";
        for cut in 1..full.len() {
            let (a, b) = full.split_at(cut);
            let mut parser = ReasoningParser::new();
            let mut events = Vec::new();
            events.extend(parser.feed(a));
            events.extend(parser.feed(b));
            events.extend(parser.finish());
            assert!(
                events.iter().any(|e| matches!(e, ParserEvent::Ref(7))),
                "cut at {cut} lost the ref"
            );
        }
    }

    #[test]
    fn ref_range_and_path() {
        let events = collect(&[
            "<reasoning><ref>src/app.ts:12-14</ref> and <ref>9</ref></reasoning>",
        ]);
        let refs: Vec<u32> = events
            .iter()
            .filter_map(|e| match e {
                ParserEvent::Ref(n) => Some(*n),
                _ => None,
            })
            .collect();
        assert_eq!(refs, vec![12, 14, 9]);
    }

    #[test]
    fn code_section_keeps_angle_brackets() {
        let events = collect(&["<code>fn add<T>(a: T) -> T { a }</code>"]);
        let code: String = events
            .iter()
            .filter_map(|e| match e {
                ParserEvent::CodeText(t) => Some(t.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(code, "fn add<T>(a: T) -> T { a }");
    }

    #[test]
    fn tag_like_symbols_in_prose_are_tolerated() {
        // A `<` followed by lots of text then a `>` that is not a real tag.
        let events = collect(&["<reasoning>guard: value < max && a > b</reasoning>"]);
        let text: String = events
            .iter()
            .filter_map(|e| match e {
                ParserEvent::Text(t) => Some(t.as_str()),
                _ => None,
            })
            .collect();
        assert!(text.contains("value < max && a > b"));
    }

    #[test]
    fn finishes_open_sections() {
        let mut parser = ReasoningParser::new();
        let mut out = Vec::new();
        out.extend(parser.feed("<reasoning>Only reasoning, no code"));
        out.extend(parser.finish());
        assert!(out.iter().any(|e| matches!(e, ParserEvent::Text(_))));
        assert!(!out.iter().any(|e| matches!(e, ParserEvent::CodeEnd)));
    }
}