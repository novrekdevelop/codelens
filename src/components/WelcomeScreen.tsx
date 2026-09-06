interface Props {
  onOpenFolder: () => void;
}

export default function WelcomeScreen({ onOpenFolder }: Props) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#1e1e1e]">
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-6 h-20 w-20">
          <svg viewBox="0 0 24 24" fill="none" stroke="#4cc2ff" strokeWidth="1.5" className="h-full w-full">
            <path d="M11 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" strokeLinecap="round" />
            <path d="M20.5 8.5a2.12 2.12 0 1 0-3-3L9 14v3h3l8.5-8.5z" strokeLinejoin="round" />
            <path d="M13.5 5l3 3" />
          </svg>
          <svg viewBox="0 0 24 24" fill="none" stroke="#e3b341" strokeWidth="1.5" className="absolute -bottom-1 -right-1 h-9 w-9">
            <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="text-[26px] font-bold text-[#e0e0e0]">
          CodeLens
        </h1>
        <p className="mt-1 max-w-[420px] text-[13px] leading-relaxed text-[#8a8a8a]">
          A lightweight editor that shows the AI's reasoning <em>as it happens</em> —
          the context it reads, the alternatives it discards, and why it picks
          the code it proposes.
        </p>
        <button
          className="cl-btn mt-6 rounded bg-[#0e639c] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1177bb]"
          onClick={onOpenFolder}
        >
          Open a Folder…
        </button>
        <p className="mt-3 text-[11px] text-[#6a6a6a]">
          Then place your own API key in Settings → AI Providers. CodeLens never
          bills or intermediates your usage.
        </p>
      </div>
    </div>
  );
}