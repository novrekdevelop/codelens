import { useCallback, useEffect, useState } from "react";
import type { ProviderConfig } from "../../types";
import { ipc } from "../../lib/ipc";
import ProviderCard from "./ProviderCard";

interface Props {
  onProvidersChanged: () => void;
}

export default function ProviderSettings({ onProvidersChanged }: Props) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ipc.listProviders();
      setProviders(list);
      setError(null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const afterChange = useCallback(async () => {
    await load();
    onProvidersChanged();
  }, [load, onProvidersChanged]);

  return (
    <div className="mx-auto max-w-[700px]">
      <p className="mb-3 text-[12px] leading-relaxed text-[#8a8a8a]">
        CodeLens is <span className="text-[#b6b6b6]">bring-your-own-key</span>:
        paste your own API keys below and your requests go straight to the
        provider — nothing is routed through a CodeLens server. Keys are stored
        in your operating system's credential store, never in the repository.
      </p>

      {error && (
        <div className="mb-3 rounded border border-[#6a2a2a] bg-[#2b1212] px-3 py-2 text-[12px] text-[#f48771]">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-[12px] text-[#6a6a6a]">Loading…</div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <ProviderCard key={p.id} provider={p} onChanged={afterChange} />
          ))}
        </div>
      )}
    </div>
  );
}