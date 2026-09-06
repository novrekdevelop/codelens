import { useState, useEffect, useCallback, useMemo } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Segment, StreamSession } from "../types";

export interface AIStreamState {
  /** Segments in arrival order: text chunks, alternatives, line refs. */
  segments: Segment[];
  /** Raw code accumulated from the `<code>` section. */
  code: string;
  session: StreamSession;
  /** Total characters of reasoning received so far (for the TPS meter). */
  reasoningChars: number;
  reset: () => void;
}

/**
 * Listens to the backend's `cl:*` events for one AI request and assembles
 * the streaming reasoning/code model in React state.
 */
export function useAIStream(requestId: string | null): AIStreamState {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [code, setCode] = useState("");
  const [session, setSession] = useState<StreamSession>({
    requestId: requestId ?? "",
    status: "idle",
  });
  const [reasoningChars, setReasoningChars] = useState(0);

  const reset = useCallback(() => {
    setSegments([]);
    setCode("");
    setReasoningChars(0);
    setSession({ requestId: requestId ?? "", status: "idle" });
  }, [requestId]);

  useEffect(() => {
    if (!requestId) return;
    reset();

    const unlisteners: Promise<UnlistenFn>[] = [];
    let disposed = false;

    const on = (event: string, handler: (payload: any) => void) => {
      if (disposed) return;
      unlisteners.push(listen(event, (ev) => handler(ev.payload)));
    };

    /** Append a segment only if it is still the active request.
     *  Returns the same array reference when there is nothing to do. */
    const append = (seg: Segment) => {
      setSegments((prev) => [...prev, seg]);
    };

    on("cl:session", (p: any) => {
      if (p.requestId !== requestId) return;
      setSession({
        requestId,
        status: p.status,
        error: p.error ?? undefined,
        model: p.model ?? undefined,
      });
      if (p.status === "started") {
        setSegments([]);
        setCode("");
        setReasoningChars(0);
      }
    });

    on("cl:reasoning_text", (p: any) => {
      if (p.requestId !== requestId) return;
      append({ kind: "text", text: p.text });
      setReasoningChars((c) => c + (p.text as string).length);
    });

    on("cl:alt_begin", (p: any) => {
      if (p.requestId !== requestId) return;
      append({ kind: "alt", index: p.index as number, text: "" });
    });

    on("cl:alt_text", (p: any) => {
      if (p.requestId !== requestId) return;
      const index = p.index as number;
      setSegments((prev) => {
        let pos = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          const s = prev[i];
          if (s.kind === "alt" && s.index === index) {
            pos = i;
            break;
          }
        }
        if (pos < 0) return prev;
        const next = [...prev];
        const seg = next[pos];
        if (seg.kind === "alt") {
          next[pos] = { ...seg, text: seg.text + (p.text as string) };
        }
        return next;
      });
      setReasoningChars((c) => c + (p.text as string).length);
    });

    on("cl:alt_end", (_p: any) => {
      // Alternative blocks are closed by the backend; nothing to do here.
    });

    on("cl:ref", (p: any) => {
      if (p.requestId !== requestId) return;
      append({ kind: "ref", line: p.line as number });
    });

    on("cl:code_text", (p: any) => {
      if (p.requestId !== requestId) return;
      setCode((prev) => prev + (p.text as string));
    });

    return () => {
      disposed = true;
      unlisteners.forEach((p) => p.then((u) => u()));
    };
  }, [requestId, reset]);

  const result = useMemo<AIStreamState>(
    () => ({
      segments,
      code,
      session,
      reasoningChars,
      reset,
    }),
    [segments, code, session, reasoningChars, reset],
  );

  return result;
}