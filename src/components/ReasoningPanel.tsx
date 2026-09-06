import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProviderConfig, Segment } from "../types";
import { ipc } from "../lib/ipc";
import { useAIStream } from "../hooks/useAIStream";
import { Markdown } from "../lib/markdown";
import DiffView from "./DiffView";

interface Props {
  providers: ProviderConfig[];
  activeProviderId: string | null;
  openFilePath: string | null;
  openFileContent: string;
  onProviderChange: (id: string) => void;
  onRevealLine: (line: number) => void;
  onApplyCode: (content: string) => void;
  onOpenSettings: () => void;
}

export default function ReasoningPanel({
  providers,
  activeProviderId,
  openFilePath,
  openFileContent,
  onProviderChange,
  onRevealLine,
  onApplyCode,
  onOpenSettings,
}: Props) {
  const [task, setTask] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const submittedSnapshot = useRef(openFileContent);
  const submittedTask = useRef("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const stream = useAIStream(requestId);
  const { segments, code, session, reasoningChars } = stream;

  const streaming = session.status === "started";
  const finished = session.status === "finished";

  // Auto-scroll the reasoning feed while it streams.
  useEffect(() => {
    if (streaming) {
      const node = scrollRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    }
  }, [segments, streaming]);

  // Token-per-second estimate (heuristic: ~4 chars ≈ 1 token).
  const tps = useMemo(() => {
    if (!startedAt || !streaming) return 0;
    const elapsed = Math.max((Date.now() - startedAt) / 1000, 0.001);
    return Math.round(reasoningChars / 4 / elapsed);
  }, [reasoningChars, streaming, startedAt]);

  // Keep the meter ticking even between token bursts.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!streaming) return;
    const timer = setInterval(() => setTick((n) => n + 1), 800);
    return () => clearInterval(timer);
  }, [streaming]);

  const submit = useCallback(
    async (taskOverride?: string) => {
      setLocalError(null);
      setApplied(false);
      setDismissed(false);

      const finalTask = taskOverride?.trim() || task.trim();
      if (!finalTask) {
        setLocalError("Describe what you want the AI to do.");
        return;
      }
      if (!activeProviderId) {
        setLocalError("No active provider. Configure one in Settings → AI Providers.");
        return;
      }
      if (!openFilePath) {
        setLocalError("Open a file first — the AI edits the file you are viewing.");
        return;
      }
      submittedSnapshot.current = openFileContent;
      submittedTask.current = finalTask;

      const id = crypto.randomUUID();
      setRequestId(id);
      setStartedAt(Date.now());

      try {
        await ipc.aiRequest({
          requestId: id,
          providerId: activeProviderId,
          filePath: openFilePath,
          fileContent: openFileContent,
          task: finalTask,
        });
      } catch (err) {
        setLocalError(String(err));
        setRequestId(null);
        setStartedAt(null);
      }
    },
    [task, activeProviderId, openFilePath, openFileContent],
  );

  const cancel = useCallback(() => {
    if (requestId) void ipc.cancelRequest(requestId);
  }, [requestId]);

  const askAlternative = useCallback(() => {
    const original = submittedTask.current || "the previous task";
    void submit(
      `The user REJECTED your previous proposal. Give a clearly different approach for: ${original}`,
    );
  }, [submit]);

  const clearCurrent = useCallback(() => {
    stream.reset();
    setRequestId(null);
    setStartedAt(null);
    setApplied(false);
    setDismissed(false);
    setLocalError(null);
  }, [stream]);

  const showDiff =
    finished && code.trim().length > 0 && !applied && !dismissed;

  const hasUsableProvider = providers.some((p) => p.hasApiKey || p.isActive);
return (
    <div className="flex h-full min-w-0 flex-col bg-[#1c1c1c]">
      {/* Panel header */}
      <div className="flex items-center gap-2 border-b border-[#2d2d2d] px-3 py-2">
        <span className="text-[12px] font-semibold tracking-wide text-[#dcdcdc]">
          AI Reasoning
        </span>
        <select
          value={activeProviderId ?? ""}
          onChange={(e) => onProviderChange(e.target.value)}
          className="ml-auto max-w-[180px] truncate rounded border border-[#3a3a3a] bg-[#252526] px-1.5 py-1 text-[11px] text-[#ccc] outline-none focus:border-[#0e639c]"
          title="Active provider"
        >
          <option value="" disabled>
            No provider
          </option>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          className="cl-btn rounded p-1 text-[#888] hover:bg-[#2d2d2d] hover:text-[#ccc]"
          onClick={onOpenSettings}
          title="AI Providers settings"
        >
          <GearIcon />
        </button>
      </div>

      {/* Prompt input */}
      <div className="border-b border-[#2d2d2d] p-2">
        <div className="flex items-end gap-1 rounded border border-[#3a3a3a] bg-[#252526] px-2 py-1.5 focus-within:border-[#0e639c]">
          <textarea
            value={task}
            onChange={(e) => setTask(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !streaming) {
                e.preventDefault();
                void submit();
              }
              if (e.key === "Escape" && streaming) cancel();
            }}
            placeholder={
              openFilePath
                ? 'e.g. "Refactor this function to make it more readable"'
                : "Open a file, then ask the AI to change it…"
            }
            rows={2}
            className="max-h-28 w-full resize-none bg-transparent text-[12.5px] text-[#ddd] placeholder-[#6a6a6a] outline-none"
          />
          {streaming ? (
            <button
              className="cl-btn mb-0.5 shrink-0 rounded bg-[#b34a4a] px-2 py-1 text-[11px] text-white hover:bg-[#c05050]"
              onClick={cancel}
            >
              ■ Stop
            </button>
          ) : (
            <button
              className="cl-btn mb-0.5 shrink-0 rounded bg-[#0e639c] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#1177bb] disabled:opacity-40"
              onClick={() => void submit()}
              disabled={!openFilePath || !activeProviderId}
            >
              Ask AI
            </button>
          )}
        </div>
        {localError && (
          <div className="mt-1.5 rounded border border-[#6a2a2a] bg-[#2b1212] px-2 py-1 text-[11.5px] text-[#f48771]">
            {localError}
          </div>
        )}
      </div>
{/* Reasoning stream */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {!requestId && segments.length === 0 && !localError && (
          <EmptyState hasFile={!!openFilePath} hasProvider={hasUsableProvider} />
        )}

        <ReasoningContent
          segments={segments}
          onRevealLine={onRevealLine}
          streaming={streaming}
        />

        {streaming && (
          <div className="mt-2 flex items-center gap-2 text-[11px] text-[#7a7a7a]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#4cc2ff]" />
            <span>model is thinking…</span>
            <span className="ml-auto font-mono">{tps} tok/s</span>
            <span className="font-mono">
              {Math.round(reasoningChars / 4).toLocaleString()} tok
            </span>
          </div>
        )}

        {session.status === "error" && session.error && (
          <div className="mt-2 rounded border border-[#6a2a2a] bg-[#2b1212] px-2 py-2 text-[12px] text-[#f48771]">
            {session.error}
          </div>
        )}

        {session.status === "cancelled" && (
          <div className="mt-2 rounded border border-[#4a4a4a] bg-[#2a2a2a] px-2 py-1.5 text-[12px] text-[#aaa]">
            Request cancelled.
          </div>
        )}

        {finished && code.trim().length === 0 && !dismissed && (
          <div className="mt-2 rounded border border-[#4a4a4a] bg-[#2a2a2a] px-2 py-1.5 text-[12px] text-[#aaa]">
            The model produced no code block to apply.
          </div>
        )}

        {showDiff && (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11.5px] font-semibold text-[#dcdcdc]">
                Review the proposed change
              </span>
              <button
                className="cl-btn rounded border border-[#4a4a4a] px-2 py-0.5 text-[11px] text-[#ccc] hover:bg-[#2d2d2d]"
                onClick={askAlternative}
              >
                ⟳ Ask alternative
              </button>
            </div>
            <DiffView
              oldText={submittedSnapshot.current}
              newText={code}
              onApply={(finalText) => {
                onApplyCode(finalText);
                setApplied(true);
              }}
              onReject={() => setDismissed(true)}
            />
          </div>
        )}

        {applied && (
          <div className="mt-2 flex items-center gap-2 rounded border border-[#2d6a3f] bg-[#122b1b] px-2 py-1.5 text-[12px] text-[#89d185]">
            <span>Changes applied to the editor.</span>
            <button
              className="cl-btn ml-auto rounded border border-[#3a6a4a] px-2 py-0.5 text-[11px] hover:bg-[#1c3a28]"
              onClick={clearCurrent}
            >
              New request
            </button>
          </div>
        )}

        {dismissed && !applied && finished && (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-[#aaa]">
            <span>Suggestion dismissed.</span>
            <button
              className="cl-btn rounded border border-[#4a4a4a] px-2 py-0.5 text-[11px] hover:bg-[#2d2d2d]"
              onClick={() => setDismissed(false)}
            >
              Show again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
function ReasoningContent({
  segments,
  onRevealLine,
  streaming,
}: {
  segments: Segment[];
  onRevealLine: (line: number) => void;
  streaming: boolean;
}) {
  return (
    <div>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          if (seg.text.trim() === "") return null;
          return (
            <div key={`t-${i}`} className="cl-stream-in">
              <Markdown text={seg.text} />
            </div>
          );
        }
        if (seg.kind === "alt") {
          return (
            <div
              key={`a-${i}`}
              className="cl-stream-in my-1.5 rounded-md border border-[#7a5f2a]/60 bg-[#2b2413]/60 px-2 py-1.5"
            >
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-[#e3b341]">
                <span>🛤</span> Road not taken
              </div>
              <div className="text-[#d0b884]">
                <Markdown text={seg.text} />
              </div>
            </div>
          );
        }
        return (
          <button
            key={`r-${i}`}
            className="cl-btn mx-0.5 my-1 inline-flex items-center rounded border border-[#2d5a80] bg-[#122c40] px-1.5 py-0.5 font-mono text-[10.5px] text-[#9cdcfe] hover:border-[#3a7cb0] hover:bg-[#16364f]"
            onClick={() => onRevealLine(seg.line)}
            title={`Jump to line ${seg.line}`}
          >
            ⤷ L{seg.line}
          </button>
        );
      })}
      {streaming && (
        <span className="cl-caret ml-0.5 inline-block h-[13px] w-[7px] bg-[#4cc2ff]" />
      )}
    </div>
  );
}

function EmptyState({ hasFile, hasProvider }: { hasFile: boolean; hasProvider: boolean }) {
  return (
    <div className="mt-6 px-2 pb-2 text-center">
      <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-[#122c40] p-2">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4cc2ff"
          strokeWidth="1.6"
          className="h-full w-full"
        >
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="M15 15l5 5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-[12.5px] font-medium text-[#dcdcdc]">Visible reasoning</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-[#7a7a7a]">
        {!hasFile
          ? "Open a file, then ask the AI to modify it. You'll watch it think — line by line, alternative by alternative."
          : !hasProvider
            ? "Configure an AI provider (your own API key) in Settings → AI Providers to get started."
            : "Ask anything — the model's reasoning streams here in real time, with the context lines it uses and the alternatives it discards."}
      </p>
    </div>
  );
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}