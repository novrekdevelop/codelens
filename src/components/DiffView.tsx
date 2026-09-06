import { useEffect, useMemo, useState } from "react";
import {
  applyDecisions,
  blockSummary,
  computeBlocks,
  type ChangeBlock,
} from "../lib/diff";

interface Props {
  oldText: string;
  newText: string;
  onApply: (finalText: string) => void;
  onReject: () => void;
}

/**
 * Line-by-line code review of the AI's proposal. Each change hunk can be
 * accepted (keep new lines) or rejected (keep original lines); decisions can
 * also be made in bulk.
 */
export default function DiffView({ oldText, newText, onApply, onReject }: Props) {
  const blocks = useMemo(() => computeBlocks(oldText, newText), [oldText, newText]);
  // hunk index -> keep new lines (default true)
  const [decisions, setDecisions] = useState<Map<number, boolean>>(() => new Map());
  const [finalText, setFinalText] = useState(() => oldText);

  useEffect(() => {
    setFinalText(applyDecisions(oldText, blocks, decisions));
  }, [oldText, blocks, decisions]);

  const setDecision = (index: number, keepNew: boolean) => {
    setDecisions((prev) => {
      const next = new Map(prev);
      next.set(index, keepNew);
      return next;
    });
  };

  const allTo = (keepNew: boolean) => {
    const next = new Map<number, boolean>();
    for (let i = 0; i < blocks.length; i++) next.set(i, keepNew);
    setDecisions(next);
  };

  if (blocks.length === 0) {
    return (
      <div className="rounded-md border border-[#3a3a3a] bg-[#1f1f1f] p-3 text-[13px] text-[#9a9a9a]">
        No differences between the file and the proposal.
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-md border border-[#3a3a3a] bg-[#1f1f1f]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#2d2d2d] px-3 py-2">
        <span className="text-[12px] font-semibold text-[#dcdcdc]">
          Proposed changes
        </span>
        <span className="rounded bg-[#2d2d2d] px-1.5 py-0.5 font-mono text-[11px] text-[#9cdcfe]">
          {blockSummary(blocks)}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button
            className="cl-btn rounded bg-[#0e639c] px-2 py-0.5 text-[11px] text-white hover:bg-[#1177bb]"
            onClick={() => allTo(true)}
          >
            Accept all
          </button>
          <button
            className="cl-btn rounded border border-[#4a4a4a] px-2 py-0.5 text-[11px] text-[#ccc] hover:bg-[#2d2d2d]"
            onClick={() => allTo(false)}
          >
            Reject all
          </button>
        </div>
      </div>

      {/* Hunks */}
      <div className="max-h-[300px] space-y-2 overflow-y-auto p-2">
        {blocks.map((block, i) => (
          <HunkRow
            key={`${block.oldStart}-${i}`}
            block={block}
            index={i}
            keepNew={decisions.get(i) ?? true}
            onDecide={setDecision}
          />
        ))}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-2 border-t border-[#2d2d2d] px-3 py-2">
        <button
          className="cl-btn rounded bg-[#2ea043] px-3 py-1 text-[12px] font-medium text-white hover:bg-[#2f9e4a]"
          onClick={() => onApply(finalText)}
        >
          ✓ Apply changes
        </button>
        <button
          className="cl-btn rounded border border-[#4a4a4a] px-3 py-1 text-[12px] text-[#ccc] hover:bg-[#2d2d2d]"
          onClick={onReject}
        >
          Dismiss
        </button>
        <span className="ml-auto font-mono text-[10px] text-[#7a7a7a]">
          {finalText.length.toLocaleString()} chars
        </span>
      </div>
    </div>
  );
}

function HunkRow({
  block,
  index,
  keepNew,
  onDecide,
}: {
  block: ChangeBlock;
  index: number;
  keepNew: boolean;
  onDecide: (index: number, keepNew: boolean) => void;
}) {
  return (
    <div
      className={`rounded border ${
        keepNew
          ? "border-[#2d6a3f] bg-[#122b1b]/50"
          : "border-[#6a3a3a] bg-[#2b1212]/50"
      }`}
    >
      <div className="flex items-center gap-1.5 border-b border-black/30 px-2 py-1">
        <span className="font-mono text-[10px] text-[#6a9955]">
          L{block.oldStart}
        </span>
        <div className="ml-auto flex gap-1">
          <button
            className={`cl-btn rounded px-2 py-0.5 text-[10px] ${
              keepNew
                ? "bg-[#2ea043] text-white"
                : "border border-[#4a4a4a] text-[#aaa] hover:bg-[#2d2d2d]"
            }`}
            onClick={() => onDecide(index, true)}
          >
            Keep new
          </button>
          <button
            className={`cl-btn rounded px-2 py-0.5 text-[10px] ${
              !keepNew
                ? "bg-[#d94f4f] text-white"
                : "border border-[#4a4a4a] text-[#aaa] hover:bg-[#2d2d2d]"
            }`}
            onClick={() => onDecide(index, false)}
          >
            Keep original
          </button>
        </div>
      </div>
      <div className="font-mono text-[11.5px] leading-relaxed">
        {block.removed.map((line, li) => (
          <div key={`r-${index}-${li}`} className="flex bg-[#2d1b1b] text-[#f48771]">
            <span className="w-4 shrink-0 select-none pl-1 text-[#8b5a5a]">−</span>
            <span className="whitespace-pre-wrap break-all pr-2 pl-0.5">{line}</span>
          </div>
        ))}
        {block.added.map((line, li) => (
          <div key={`a-${index}-${li}`} className="flex bg-[#1a2d22] text-[#89d185]">
            <span className="w-4 shrink-0 select-none pl-1 text-[#5a8b6a]">+</span>
            <span className="whitespace-pre-wrap break-all pr-2 pl-0.5">{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}