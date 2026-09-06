import type { ProviderConfig, SessionStatus } from "../types";

interface Props {
  activeProvider: ProviderConfig | null;
  fileName: string | null;
  dirty: boolean;
  sessionStatus: SessionStatus;
  message?: string;
}

export default function StatusBar({ activeProvider, fileName, dirty, sessionStatus, message }: Props) {
  const statusText = (() => {
    switch (sessionStatus) {
      case "started":
        return "AI responding…";
      case "finished":
        return "AI response complete";
      case "cancelled":
        return "AI request cancelled";
      case "error":
        return "AI request failed";
      default:
        return "Ready";
    }
  })();

  return (
    <div className="flex h-[22px] items-center gap-3 border-t border-[#252526] bg-[#007acc] px-2 text-[11px] text-white">
      <span className="flex items-center gap-1">
        {/* branch icon */}
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
          <path d="M4 1.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM5 4.3A2.5 2.5 0 0 1 8 6.5v3A2.5 2.5 0 1 0 11 12h.3A2.5 2.5 0 1 0 13 9.5h-1A1.5 1.5 0 0 1 10.5 8v-.5A3.5 3.5 0 0 0 9 4.9V4.3A2.5 2.5 0 0 1 5 4.3z" />
        </svg>
        main
      </span>
      {activeProvider && (
        <span className="flex items-center gap-1" title="Active AI provider">
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
            <path d="M7.5 1.5A1 1 0 0 1 8.5 1h1a1 1 0 0 1 .98.85l.27 1.5c.4.15.78.34 1.13.58l1.42-.51a1 1 0 0 1 1.2.42l.5.86a1 1 0 0 1-.18 1.27l-1.12 1.02c.02.2.03.4.03.61 0 .2-.01.4-.03.61l1.12 1.02a1 1 0 0 1 .18 1.27l-.5.86a1 1 0 0 1-1.2.42l-1.42-.51c-.35.24-.73.43-1.13.58l-.27 1.5A1 1 0 0 1 9.5 15h-1a1 1 0 0 1-.98-.85l-.27-1.5a5.6 5.6 0 0 1-1.13-.58l-1.42.51a1 1 0 0 1-1.2-.42l-.5-.86a1 1 0 0 1 .18-1.27l1.12-1.02A5.6 5.6 0 0 1 4 8c0-.2.01-.4.03-.61L2.9 6.37a1 1 0 0 1-.18-1.27l.5-.86a1 1 0 0 1 1.2-.42l1.42.51c.35-.24.73-.43 1.13-.58l.27-1.5zM8.5 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
          </svg>
          {activeProvider.model}
        </span>
      )}
      {fileName && (
        <span className="truncate">
          {fileName}
          {dirty ? " ●" : ""}
        </span>
      )}
      <span className="ml-auto px-1">{message || statusText}</span>
    </div>
  );
}