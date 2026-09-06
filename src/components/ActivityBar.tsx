export type ActivityView = "explorer" | "ai";

interface Props {
  view: ActivityView;
  onSelect: (view: ActivityView) => void;
  onOpenFolder: () => void;
  onOpenSettings: () => void;
}

export default function ActivityBar({ view, onSelect, onOpenFolder, onOpenSettings }: Props) {
  return (
    <div className="flex w-[46px] shrink-0 flex-col items-center border-r border-[#252526] bg-[#2c2c2c] py-2">
      <button
        className={`cl-btn mb-1 flex h-11 w-full items-center justify-center ${
          view === "explorer" ? "border-l-2 border-white bg-[#37373d]" : "text-[#878787] hover:bg-[#313137] hover:text-[#ccc]"
        }`}
        onClick={() => onSelect("explorer")}
        title="Explorer"
      >
        <FilesIcon active={view === "explorer"} />
      </button>
      <button
        className={`cl-btn mb-1 flex h-11 w-full items-center justify-center ${
          view === "ai" ? "border-l-2 border-white bg-[#37373d]" : "text-[#878787] hover:bg-[#313137] hover:text-[#ccc]"
        }`}
        onClick={() => onSelect("ai")}
        title="AI Reasoning"
      >
        <SparklesIcon active={view === "ai"} />
      </button>
      <div className="flex-1" />
      <button
        className="cl-btn flex h-11 w-full items-center justify-center text-[#878787] hover:bg-[#313137] hover:text-[#ccc]"
        onClick={onOpenFolder}
        title="Open folder"
      >
        <FolderOpenIcon />
      </button>
      <button
        className="cl-btn flex h-11 w-full items-center justify-center text-[#878787] hover:bg-[#313137] hover:text-[#ccc]"
        onClick={onOpenSettings}
        title="Settings / AI Providers"
      >
        <SettingsIcon />
      </button>
    </div>
  );
}

function FilesIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M12.5 6L11 4.5A1.5 1.5 0 0 0 9.94 4H4.5A1.5 1.5 0 0 0 3 5.5v13A1.5 1.5 0 0 0 4.5 20h15A1.5 1.5 0 0 0 21 18.5v-10A1.5 1.5 0 0 0 19.5 7h-5.06a1.5 1.5 0 0 1-1.06-.44L12.5 6z" opacity={active ? 1 : 0.75} />
    </svg>
  );
}

function SparklesIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M12 4l1.7 4.6L18.5 10l-4.8 1.7L12 16.5l-1.7-4.8L5.5 10l4.8-1.4L12 4z" opacity={active ? 1 : 0.75} strokeLinejoin="round" />
      <path d="M18.5 15l.7 1.8L21 17.5l-1.8.7L18.5 20l-.7-1.8L16 17.5l1.8-.7.7-1.8z" opacity={active ? 1 : 0.6} strokeLinejoin="round" />
    </svg>
  );
}

function FolderOpenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h7.5A1.5 1.5 0 0 1 20 9.5V10H5.8a1 1 0 0 0-.97.76L3.2 18v-10.5z" opacity={0.75} />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" opacity={0.75} />
    </svg>
  );
}