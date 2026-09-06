// Shared front-end types mirroring the Rust backend's serde structures.

export type ProviderKind = "anthropic" | "openai" | "google" | "openai_compatible";

export interface ProviderConfig {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  isActive: boolean;
  hasApiKey: boolean;
  apiKey?: string | null;
}

export interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[] | null;
}

export interface OpenTab {
  path: string;
  content: string;
  saved: string;
  dirty: boolean;
}

export type SessionStatus = "idle" | "started" | "finished" | "cancelled" | "error";

export interface StreamSession {
  requestId: string;
  status: SessionStatus;
  error?: string;
  model?: string;
}

/** A rendered chunk of the reasoning panel. */
export type Segment =
  | { kind: "text"; text: string }
  | { kind: "alt"; index: number; text: string }
  | { kind: "ref"; line: number };

export interface AIRequestPayload {
  requestId: string;
  providerId: string;
  filePath: string;
  fileContent: string;
  task: string;
}