import { useCallback, useEffect, useRef, useState } from "react";
import ActivityBar, { type ActivityView } from "./components/ActivityBar";
import FileTree from "./components/FileTree";
import Editor, { type EditorHandle } from "./components/Editor";
import ReasoningPanel from "./components/ReasoningPanel";
import StatusBar from "./components/StatusBar";
import WelcomeScreen from "./components/WelcomeScreen";
import SettingsView from "./components/settings/SettingsView";
import { ipc } from "./lib/ipc";
import type { OpenTab, ProviderConfig, TreeNode } from "./types";

export default function App() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [view, setView] = useState<ActivityView>("explorer");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [rootPath, setRootPath] = useState<string | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState("Ready");
  const editorRef = useRef<EditorHandle>(null);

  const activeTab = tabs.find((t) => t.path === activePath) ?? null;
  const activeProvider = providers.find((p) => p.id === activeProviderId) ?? null;

  const loadProviders = useCallback(async () => {
    try {
      const list = await ipc.listProviders();
      setProviders(list);
      const active = list.find((p) => p.isActive)?.id ?? null;
      setActiveProviderId(active);
    } catch {
      // backend unavailable (e.g. running bare `vite` in a browser) — silent
    }
  }, []);

  useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

  const openFolder = useCallback(async () => {
    try {
      const dir = await ipc.openFolder();
      if (!dir) return;
      const t = await ipc.readFolderTree(dir);
      setRootPath(dir);
      setTree(t);
      setView("explorer");
      setStatusMsg(`Opened folder: ${dir}`);
    } catch (err) {
      setStatusMsg(String(err));
    }
  }, []);

  const openFile = useCallback(
    async (path: string) => {
      try {
        const existing = tabs.find((t) => t.path === path);
        if (existing) {
          setActivePath(path);
          setView("explorer");
          return;
        }
        const content = await ipc.readFile(path);
        setTabs((prev) => [...prev, { path, content, saved: content, dirty: false }]);
        setActivePath(path);
        setView("explorer");
      } catch (err) {
        setStatusMsg(String(err));
      }
    },
    [tabs],
  );

  const saveFile = useCallback(async () => {
    if (!activeTab) return;
    try {
      await ipc.writeFile(activeTab.path, activeTab.content);
      setTabs((prev) =>
        prev.map((t) =>
          t.path === activeTab.path ? { ...t, saved: t.content, dirty: false } : t,
        ),
      );
      setStatusMsg(`Saved ${activeTab.path}`);
    } catch (err) {
      setStatusMsg(String(err));
    }
  }, [activeTab]);

  const closeTab = useCallback((path: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      const next = prev.filter((t) => t.path !== path);
      setActivePath((cur) => {
        if (cur !== path) return cur;
        if (next.length === 0) return null;
        return next[Math.min(idx, next.length - 1)].path;
      });
      return next;
    });
  }, []);

  const onChangeContent = useCallback(
    (value: string) => {
      if (!activePath) return;
      setTabs((prev) =>
        prev.map((t) =>
          t.path === activePath ? { ...t, content: value, dirty: value !== t.saved } : t,
        ),
      );
    },
    [activePath],
  );

  const onApplyCode = useCallback(
    (content: string) => {
      if (!activePath) return;
      setTabs((prev) =>
        prev.map((t) =>
          t.path === activePath ? { ...t, content, dirty: content !== t.saved } : t,
        ),
      );
    },
    [activePath],
  );

  const setProviderActive = useCallback(
    async (id: string) => {
      try {
        await ipc.setActiveProvider(id);
        setActiveProviderId(id);
        await loadProviders();
      } catch (err) {
        setStatusMsg(String(err));
      }
    },
    [loadProviders],
  );

  const revealLine = useCallback((line: number) => {
    editorRef.current?.revealLine(line);
    setView("explorer");
  }, []);
// Global keyboard shortcuts: Ctrl+S save, Ctrl+O open folder,
  // Ctrl+Shift+\ toggle the AI reasoning panel, Ctrl+, settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        void saveFile();
      } else if (k === "o") {
        e.preventDefault();
        void openFolder();
      } else if (k === ",") {
        e.preventDefault();
        setSettingsOpen((v) => !v);
      } else if (k === "\\" && e.shiftKey) {
        e.preventDefault();
        setView((v) => (v === "ai" ? "explorer" : "ai"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveFile, openFolder]);

  const rootName = rootPath ? rootPath.split(/[\\/]/).pop() ?? rootPath : null;
  const fileSignal = tabs.find((t) => t.path === activePath);

  return (
    <div className="flex h-full w-full flex-col bg-[#1e1e1e]">
      <div className="flex min-h-0 flex-1">
        <ActivityBar
          view={view}
          onSelect={setView}
          onOpenFolder={() => void openFolder()}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {view === "explorer" && (
          <div className="flex w-[230px] shrink-0 flex-col border-r border-[#252526] bg-[#252526]">
            <FileTree
              rootName={rootName ?? "Workspace"}
              tree={tree}
              activePath={activePath}
              onOpenFile={(p) => void openFile(p)}
            />
          </div>
        )}

        {/* Center: editor area */}
        <div className="flex min-w-0 flex-1 flex-col bg-[#1e1e1e]">
          {/* Tab bar */}
          {tabs.length > 0 && (
            <div className="flex h-[35px] shrink-0 items-stretch overflow-x-auto border-b border-[#252526] bg-[#252526] text-[12px]">
              {tabs.map((t) => {
                const active = t.path === activePath;
                const fileName = t.path.split(/[\\/]/).pop() ?? t.path;
                return (
                  <div
                    key={t.path}
                    className={`group flex max-w-[180px] shrink-0 cursor-pointer items-center gap-1 px-3 ${
                      active
                        ? "border-t-2 border-[#4cc2ff] bg-[#1e1e1e] text-[#e0e0e0]"
                        : "border-t-2 border-transparent text-[#9a9a9a] hover:bg-[#2a2a2a]"
                    }`}
                    onClick={() => setActivePath(t.path)}
                    title={t.path}
                  >
                    <span className="truncate">
                      {fileName}
                      {t.dirty ? " ●" : ""}
                    </span>
                    <button
                      className="cl-btn ml-1 hidden rounded-sm px-1 text-[#7a7a7a] hover:bg-[#3a3a3a] hover:text-[#ccc] group-hover:block"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(t.path);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab ? (
            <div className="min-h-0 flex-1">
              <Editor
                ref={editorRef}
                path={activeTab.path}
                value={activeTab.content}
                onChange={onChangeContent}
              />
            </div>
          ) : (
            <WelcomeScreen onOpenFolder={() => void openFolder()} />
          )}
        </div>

        {/* Right: AI reasoning panel */}
        {view === "ai" && (
          <div className="flex w-[380px] shrink-0 border-l border-[#252526]">
            <ReasoningPanel
              providers={providers}
              activeProviderId={activeProviderId}
              openFilePath={activeTab?.path ?? null}
              openFileContent={activeTab?.content ?? ""}
              onProviderChange={(id) => void setProviderActive(id)}
              onRevealLine={revealLine}
              onApplyCode={onApplyCode}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        )}
      </div>

      <StatusBar
        activeProvider={activeProvider}
        fileName={fileSignal ? (fileSignal.path.split(/[\\/]/).pop() ?? null) : null}
        dirty={fileSignal?.dirty ?? false}
        sessionStatus="idle"
        message={statusMsg}
      />

      {settingsOpen && (
        <SettingsView
          onClose={() => setSettingsOpen(false)}
          onProvidersChanged={() => void loadProviders()}
        />
      )}
    </div>
  );
}