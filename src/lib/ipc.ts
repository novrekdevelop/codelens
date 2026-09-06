import { invoke } from "@tauri-apps/api/core";
import type {
  AIRequestPayload,
  ProviderConfig,
  TreeNode,
} from "../types";

export interface SaveProviderArgs {
  id: string;
  name: string;
  kind: string;
  baseUrl: string;
  model: string;
  apiKey?: string | null;
  makeActive: boolean;
}

export interface TestConnectionArgs {
  id: string;
  kind: string;
  baseUrl: string;
  model: string;
  apiKey?: string | null;
}

export const ipc = {
  openFolder(): Promise<string | null> {
    return invoke<string | null>("open_folder_dialog");
  },
  readFolderTree(root: string): Promise<TreeNode> {
    return invoke<TreeNode>("read_folder_tree", { root });
  },
  readFile(path: string): Promise<string> {
    return invoke<string>("read_file", { path });
  },
  writeFile(path: string, content: string): Promise<void> {
    return invoke<void>("write_file", { path, content });
  },

  listProviders(): Promise<ProviderConfig[]> {
    return invoke<ProviderConfig[]>("list_provider_configs");
  },
  saveProvider(args: SaveProviderArgs): Promise<void> {
    return invoke<void>("save_provider_config", { args });
  },
  deleteProvider(id: string): Promise<void> {
    return invoke<void>("delete_provider_config", { id });
  },
  setActiveProvider(id: string): Promise<void> {
    return invoke<void>("set_active_provider", { id });
  },
  testProvider(args: TestConnectionArgs): Promise<string> {
    return invoke<string>("test_provider_connection", { args });
  },

  aiRequest(payload: AIRequestPayload): Promise<string> {
    return invoke<string>("ai_request", { args: payload });
  },
  cancelRequest(requestId: string): Promise<void> {
    return invoke<void>("cancel_request", { requestId });
  },
};