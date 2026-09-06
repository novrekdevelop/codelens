import { useState } from "react";
import type { TreeNode } from "../types";

interface Props {
  rootName: string;
  tree: TreeNode | null;
  activePath: string | null;
  onOpenFile: (path: string) => void;
}

export default function FileTree({ rootName, tree, activePath, onOpenFile }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  return (
    <div className="h-full overflow-y-auto text-[12.5px]">
      <div className="px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-widest text-[#9a9a9a]">
        Explorer
      </div>
      <div className="mb-1 flex items-center gap-1.5 px-3 pb-1 text-[12px] text-[#ccc]">
        <FolderIcon />
        <span className="truncate">{rootName}</span>
      </div>
      <div className="px-1 pb-4">
        {tree ? (
          <DirNode
            node={tree}
            depth={0}
            collapsed={collapsed}
            onToggle={toggle}
            activePath={activePath}
            onOpenFile={onOpenFile}
          />
        ) : (
          <div className="px-3 py-2 text-[11.5px] text-[#6a6a6a]">No folder open.</div>
        )}
      </div>
    </div>
  );
}

function DirNode({
  node,
  depth,
  collapsed,
  onToggle,
  activePath,
  onOpenFile,
}: {
  node: TreeNode;
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  activePath: string | null;
  onOpenFile: (path: string) => void;
}) {
  const isCollapsed = collapsed.has(node.path);

  if (!node.isDir) {
    const active = node.path === activePath;
    return (
      <button
        className={`cl-btn flex w-full items-center gap-1.5 rounded px-2 py-[3px] text-left ${
          active
            ? "bg-[#094771] text-white"
            : "text-[#bbb] hover:bg-[#2a2d2e]"
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onOpenFile(node.path)}
        title={node.path}
      >
        <FileIcon />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        className={`cl-btn flex w-full items-center gap-1.5 rounded px-2 py-[3px] text-left text-[#ccc] hover:bg-[#2a2d2e]`}
        style={{ paddingLeft: 4 + depth * 12 }}
        onClick={() => onToggle(node.path)}
        title={node.path}
      >
        <span className={`inline-block w-3 text-[9px] text-[#888] ${isCollapsed ? "" : "rotate-90"}`}>
          ▸
        </span>
        <FolderIcon />
        <span className="truncate">{node.name}</span>
      </button>
      {!isCollapsed &&
        node.children?.map((child) => (
          <DirNode
            key={child.path}
            node={child}
            depth={depth + 1}
            collapsed={collapsed}
            onToggle={onToggle}
            activePath={activePath}
            onOpenFile={onOpenFile}
          />
        ))}
    </div>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0">
      <path
        d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.1c.4 0 .78.16 1.06.44l.9.9c.14.14.33.22.53.22h4.4A1.5 1.5 0 0 1 14 6.06V11.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7z"
        fill="#dcb269"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5 shrink-0">
      <path
        d="M4 2.5A1.5 1.5 0 0 1 5.5 1h4a.5.5 0 0 1 .35.15l3 3a.5.5 0 0 1 .15.35v9A1.5 1.5 0 0 1 11.5 15h-6A1.5 1.5 0 0 1 4 13.5v-11z"
        fill="#8ea4b4"
      />
    </svg>
  );
}