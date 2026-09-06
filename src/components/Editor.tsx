import { forwardRef, useImperativeHandle, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import * as monaco from "monaco-editor";

export interface EditorHandle {
  revealLine: (line: number) => void;
  focus: () => void;
}

interface Props {
  path: string;
  value: string;
  onChange: (value: string) => void;
}

export function langFromPath(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    md: "markdown",
    py: "python",
    rb: "ruby",
    rs: "rust",
    go: "go",
    java: "java",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    cxx: "cpp",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    sh: "shell",
    bash: "shell",
    zsh: "shell",
    yaml: "yaml",
    yml: "yaml",
    toml: "ini",
    xml: "xml",
    sql: "sql",
  };
  return map[ext] ?? "plaintext";
}

const CodeEditor = forwardRef<EditorHandle, Props>(function CodeEditor(
  { path, value, onChange },
  ref,
) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const onMount: OnMount = (ed) => {
    editorRef.current = ed;
  };

  useImperativeHandle(
    ref,
    () => ({
      revealLine(line) {
        const ed = editorRef.current;
        if (!ed) return;
        const model = ed.getModel();
        if (!model) return;
        const lineNum = Math.max(1, Math.min(line, model.getLineCount()));
        ed.revealLineInCenter(lineNum);
        ed.setPosition({ lineNumber: lineNum, column: 1 });
        ed.setSelection(new monaco.Range(lineNum, 1, lineNum, 1));
        ed.focus();
      },
      focus() {
        editorRef.current?.focus();
      },
    }),
    [],
  );

  return (
    <Editor
      path={path}
      value={value}
      language={langFromPath(path)}
      theme="vs-dark"
      onMount={onMount}
      onChange={(v) => onChange(v ?? "")}
      options={{
        automaticLayout: true,
        fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
        fontSize: 13,
        minimap: { enabled: true, maxColumn: 80 },
        scrollBeyondLastLine: false,
        tabSize: 2,
        smoothScrolling: true,
        padding: { top: 8 },
        renderWhitespace: "none",
        folding: true,
        lineNumbersMinChars: 3,
        roundedSelection: false,
        overviewRulerLanes: 1,
      }}
    />
  );
});

export default CodeEditor;