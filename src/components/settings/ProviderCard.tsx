import { useState } from "react";
import type { ProviderConfig, ProviderKind } from "../../types";
import { ipc } from "../../lib/ipc";

interface Props {
  provider: ProviderConfig;
  onChanged: () => Promise<void>;
}

const KIND_LABELS: Record<ProviderKind, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  openai_compatible: "Compatible",
};

export default function ProviderCard({ provider, onChanged }: Props) {
  const [name, setName] = useState(provider.name);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [model, setModel] = useState(provider.model);
  const [key, setKey] = useState("");
  const [makeActive, setMakeActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // The real key is only ever sent when the user types a new one.
  const providedKey = key.trim().length > 0 ? key : null;

  const save = async () => {
    setSaving(true);
    setError(null);
    setTestResult(null);
    try {
      await ipc.saveProvider({
        id: provider.id,
        name: name.trim() || provider.name,
        kind: provider.kind,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: providedKey,
        makeActive,
      });
      setKey("");
      setMakeActive(false);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      await onChanged();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const msg = await ipc.testProvider({
        id: provider.id,
        kind: provider.kind,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: providedKey,
      });
      setTestResult({ ok: true, text: msg });
    } catch (err) {
      setTestResult({ ok: false, text: String(err) });
    } finally {
      setTesting(false);
    }
  };

  const setActive = async () => {
    setError(null);
    try {
      await ipc.setActiveProvider(provider.id);
      await onChanged();
    } catch (err) {
      setError(String(err));
    }
  };

  const remove = async () => {
    if (!confirm(`Delete provider "${provider.name}" and its stored API key?`)) return;
    setError(null);
    try {
      await ipc.deleteProvider(provider.id);
      await onChanged();
    } catch (err) {
      setError(String(err));
    }
  };

  return (
    <div
      className={`rounded-md border bg-[#252526] p-3 ${
        provider.isActive ? "border-[#0e639c]" : "border-[#3a3a3a]"
      }`}
    >
      {/* Header row */}
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded bg-[#122c40] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4cc2ff]">
          {KIND_LABELS[provider.kind]}
        </span>
        <span className="truncate text-[13px] font-semibold text-[#e0e0e0]">{name}</span>
        {provider.isActive ? (
          <span className="ml-1 flex items-center gap-1 text-[10.5px] font-medium text-[#2ea043]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#2ea043]" /> ACTIVE
          </span>
        ) : (
          <button
            className="cl-btn ml-1 rounded border border-[#4a4a4a] px-2 py-0.5 text-[10.5px] text-[#bbb] hover:bg-[#2d2d2d]"
            onClick={() => void setActive()}
          >
            Set active
          </button>
        )}
        <button
          className="cl-btn ml-auto rounded px-1.5 py-0.5 text-[10.5px] text-[#d94f4f] hover:bg-[#331717]"
          onClick={() => void remove()}
          title="Delete provider"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Display name">
          <input
            className="cl-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Provider name"
          />
        </Field>
        <Field label="Model">
          <input
            className="cl-input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. gpt-4o"
          />
        </Field>
        <Field label="API key" wide>
          <div className="relative">
            <input
              className="cl-input pr-16"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={
                provider.hasApiKey
                  ? "Stored in OS vault — type a new key to replace it"
                  : "Paste your API key"
              }
              autoComplete="off"
              spellCheck={false}
            />
            {provider.hasApiKey && key.trim() === "" && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-[#1e3a2a] px-1.5 py-0.5 text-[10px] text-[#89d185]">
                saved
              </span>
            )}
          </div>
        </Field>
        <Field label="Base URL">
          <input
            className="cl-input"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder={
              provider.kind === "openai_compatible"
                ? "http://localhost:11434/v1"
                : "https://api.example.com"
            }
            spellCheck={false}
          />
        </Field>
      </div>

      {error && (
        <div className="mt-2 rounded border border-[#6a2a2a] bg-[#2b1212] px-2 py-1 text-[11.5px] text-[#f48771]">
          {error}
        </div>
      )}

      {testResult && (
        <div
          className={`mt-2 rounded border px-2 py-1 text-[11.5px] ${
            testResult.ok
              ? "border-[#2d6a3f] bg-[#122b1b] text-[#89d185]"
              : "border-[#6a2a2a] bg-[#2b1212] text-[#f48771]"
          }`}
        >
          {testResult.text}
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="cl-btn rounded bg-[#0e639c] px-3 py-1 text-[11.5px] font-medium text-white hover:bg-[#1177bb] disabled:opacity-50"
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "Saving…" : savedFlash ? "✓ Saved" : "Save"}
        </button>
        <button
          className="cl-btn rounded border border-[#4a4a4a] px-3 py-1 text-[11.5px] text-[#ccc] hover:bg-[#2d2d2d] disabled:opacity-50"
          onClick={() => void test()}
          disabled={testing}
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[11.5px] text-[#aaa]">
          <input
            type="checkbox"
            checked={makeActive}
            onChange={(e) => setMakeActive(e.target.checked)}
            className="accent-[#0e639c]"
          />
          Make active on save
        </label>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-0.5 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-[#8a8a8a]">
        {label}
      </span>
      {children}
    </label>
  );
}