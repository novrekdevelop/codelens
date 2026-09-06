import { useState } from "react";
import ProviderSettings from "./ProviderSettings";

interface Props {
  onClose: () => void;
  onProvidersChanged: () => void;
}

type SettingsTab = "providers" | "about";

export default function SettingsView({ onClose, onProvidersChanged }: Props) {
  const [tab, setTab] = useState<SettingsTab>("providers");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="flex h-[78vh] w-[860px] max-w-[94vw] flex-col overflow-hidden rounded-lg border border-[#3a3a3a] bg-[#1e1e1e] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="flex items-center justify-between border-b border-[#2d2d2d] px-4 py-2.5">
          <span className="text-[13px] font-semibold text-[#dcdcdc]">Settings</span>
          <button
            className="cl-btn rounded px-2 py-0.5 text-[12px] text-[#888] hover:bg-[#2d2d2d] hover:text-[#ccc]"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <nav className="flex gap-1 border-b border-[#2d2d2d] px-3 pt-2">
          {(["providers", "about"] as SettingsTab[]).map((t) => (
            <button
              key={t}
              className={`cl-btn rounded-t px-3 py-1.5 text-[12px] ${
                tab === t
                  ? "border-b-2 border-[#4cc2ff] bg-[#252526] text-[#e0e0e0]"
                  : "text-[#888] hover:bg-[#2a2a2a] hover:text-[#bbb]"
              }`}
              onClick={() => setTab(t)}
            >
              {t === "providers" ? "AI Providers" : "About"}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "providers" ? (
            <ProviderSettings onProvidersChanged={onProvidersChanged} />
          ) : (
            <AboutTab />
          )}
        </div>
      </div>
    </div>
  );
}

function AboutTab() {
  return (
    <div className="max-w-[640px] space-y-3 text-[12.5px] leading-relaxed text-[#b6b6b6]">
      <h2 className="text-[14px] font-semibold text-[#e0e0e0]">CodeLens</h2>
      <p>
        CodeLens is a lightweight desktop code editor whose AI assistant shows
        its reasoning in real time. When it proposes a change you see — token by
        token — which parts of your code it reads as context, which alternatives
        it considered, why it discarded them, and only then the final diff, which
        you accept or reject line by line.
      </p>
      <h3 className="text-[13px] font-semibold text-[#dcdcdc]">Bring your own key (BYOK)</h3>
      <p>
        CodeLens ships without any server and without any API key of its own.
        Every call goes directly from your machine to the provider you chose,
        authenticated with <em>your</em> key — stored only in your operating
        system's credential store. CodeLens never sees, logs, or bills your usage.
      </p>
      <h3 className="text-[13px] font-semibold text-[#dcdcdc]">Supported providers</h3>
      <ul className="list-inside list-disc space-y-1">
        <li>Anthropic (Claude) — Messages API</li>
        <li>OpenAI (GPT) — Chat Completions API</li>
        <li>Google (Gemini) — Generative Language API</li>
        <li>
          Any OpenAI-compatible endpoint — Ollama, LM Studio, OpenRouter, Groq,
          local gateways…
        </li>
      </ul>
      <p className="text-[#6a6a6a]">
        Licensed under the MIT License. Keyboard: <kbd className="rounded bg-[#2d2d2d] px-1">Ctrl+S</kbd> save,{" "}
        <kbd className="rounded bg-[#2d2d2d] px-1">Ctrl+O</kbd> open folder,{" "}
        <kbd className="rounded bg-[#2d2d2d] px-1">Ctrl+Shift+\\</kbd> toggle AI panel.
      </p>
    </div>
  );
}