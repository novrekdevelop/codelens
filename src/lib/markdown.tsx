import React from "react";

/**
 * Tiny streaming-safe Markdown renderer for the reasoning panel.
 * Supports: paragraphs, line breaks, `-` lists, `#` headings, **bold** and
 * `inline code`. Incomplete tokens (still streaming) render as plain text.
 */

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    const key = `${keyBase}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded bg-[#2c2c2c] px-1 py-0.5 font-mono text-[12px] text-[#e3b341]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={key}>{part}</span>;
  });
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function ParagraphBlock({ lines, start }: { lines: string[]; start: number }) {
  const isList = lines.every(
    (l) => l.trim() === "" || /^\s*([-*+])\s/.test(l),
  );

  if (isList) {
    return (
      <ul className="mt-1 list-none space-y-0.5 pl-1">
        {lines.map((line, i) => {
          const m = /^(\s*)[-*+]\s+(.*)$/.exec(line);
          if (!m) return null;
          return (
            <li key={`${start}-${i}`} className="flex gap-1.5">
              <span className="mt-[2px] shrink-0 text-[#5ea4ff]">•</span>
              <span className="break-words">
                {renderInline(m[2], `${start}-${i}`)}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }

  const first = lines[0];
  const heading = /^#{1,3}\s+(.*)$/.exec(first);
  if (heading && lines.length === 1) {
    const level = first.match(/^#{1,2}/) ? "text-[13px]" : "text-[12px]";
    return (
      <p className={`mt-2 font-semibold ${first.startsWith("# ") ? level : level} text-[#dcdcdc]`}>
        {renderInline(heading[1].trim(), `${start}-h`)}
      </p>
    );
  }

  return (
    <p className="mt-1 break-words leading-relaxed">
      {lines.map((line, i) => (
        <React.Fragment key={`${start}-${i}`}>
          {i > 0 && <br />}
          {renderInline(line, `${start}-${i}`)}
        </React.Fragment>
      ))}
    </p>
  );
}

export function Markdown({ text }: { text: string }) {
  const lines = splitLines(text ?? "");
  // Group into blocks split by blank lines.
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim() === "" && current.length > 0) {
      blocks.push(current);
      current = [];
    } else if (line.trim() !== "") {
      current.push(line);
    }
  }
  if (current.length > 0) blocks.push(current);

  return (
    <div className="text-[13px] text-[#c8c8c8]">
      {blocks.map((b, i) => (
        <ParagraphBlock key={i} lines={b} start={i} />
      ))}
    </div>
  );
}