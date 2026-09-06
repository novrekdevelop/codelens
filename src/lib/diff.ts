import { diffLines } from "diff";

export interface ChangeBlock {
  /** Original lines that were removed for this hunk. */
  removed: string[];
  /** New lines that were added for this hunk. */
  added: string[];
  /** 1-based line in the original file where this hunk starts. */
  oldStart: number;
}

function splitKeepLines(value: string): string[] {
  const lines = value.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function countNewlines(value: string): number {
  let n = 0;
  for (const ch of value) if (ch === "\n") n++;
  return n;
}

/**
 * Line-based diff of two full-file snapshots, grouped into change blocks.
 */
export function computeBlocks(oldText: string, newText: string): ChangeBlock[] {
  const parts = diffLines(oldText, newText);
  const blocks: ChangeBlock[] = [];
  let oldLine = 1;
  let removed: string[] = [];
  let added: string[] = [];

  const flush = () => {
    if (removed.length === 0 && added.length === 0) return;
    blocks.push({ removed: [...removed], added: [...added], oldStart: oldLine });
    removed = [];
    added = [];
  };

  for (const part of parts) {
    if (part.added) {
      added.push(...splitKeepLines(part.value));
    } else if (part.removed) {
      removed.push(...splitKeepLines(part.value));
      oldLine += countNewlines(part.value);
    } else {
      flush();
      oldLine += countNewlines(part.value);
    }
  }
  flush();
  return blocks;
}

/**
 * Assemble the final file content from the original lines plus per-hunk
 * accept (keep new) / reject (keep original) decisions.
 */
export function applyDecisions(
  oldText: string,
  blocks: ChangeBlock[],
  decisions: Map<number, boolean>,
): string {
  const oldLines = splitKeepLines(oldText);
  const out: string[] = [];
  let cursor = 0;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const keepNew = decisions.get(i) ?? true; // default: accept
    const start = block.oldStart - 1;

    for (let j = cursor; j < start; j++) out.push(oldLines[j]);

    if (keepNew) {
      out.push(...block.added);
    } else {
      for (let j = start; j < start + block.removed.length; j++) out.push(oldLines[j]);
    }
    cursor = start + block.removed.length;
  }

  for (let j = cursor; j < oldLines.length; j++) out.push(oldLines[j]);

  const joined = out.join("\n");
  return oldText.endsWith("\n") ? joined + "\n" : joined;
}

/** Human friendly summary used by the diff header. */
export function blockSummary(blocks: ChangeBlock[]): string {
  const added = blocks.reduce((a, b) => a + b.added.length, 0);
  const removed = blocks.reduce((a, b) => a + b.removed.length, 0);
  return `+${added} / −${removed}`;
}