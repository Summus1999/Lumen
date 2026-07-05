import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  ChatMessage,
  ChatResult,
  ChatTurn,
  Conversation,
  Memory,
  MemoryInput,
  MemoryLayer,
} from "../types";

// ---- 设置 ----
export const getSettings = (): Promise<AppSettings> =>
  invoke<AppSettings>("get_settings");

export const saveSettings = (settings: AppSettings): Promise<AppSettings> =>
  invoke<AppSettings>("save_settings", { settings });

// ---- 对话与消息 ----
export const listConversations = (): Promise<Conversation[]> =>
  invoke<Conversation[]>("list_conversations");

export const createConversation = (
  title?: string | null
): Promise<Conversation> =>
  invoke<Conversation>("create_conversation", { title: title ?? null });

export const deleteConversation = (id: number): Promise<void> =>
  invoke<void>("delete_conversation", { id });

export const listMessages = (conversationId: number): Promise<ChatMessage[]> =>
  invoke<ChatMessage[]>("list_messages", { conversationId });

// ---- 聊天（RAG + 自动抽取）----
export const chat = (turn: ChatTurn): Promise<ChatResult> =>
  invoke<ChatResult>("chat", { turn });

// ---- 记忆 CRUD ----
// layer 可选：传则只拉对应层，不传拉全部。
export const listMemories = (layer?: MemoryLayer): Promise<Memory[]> =>
  invoke<Memory[]>("list_memories", { layer: layer ?? null });

export const addMemory = (input: MemoryInput): Promise<Memory> =>
  invoke<Memory>("add_memory", { input });

export const updateMemory = (
  id: number,
  input: Partial<MemoryInput>
): Promise<Memory> => invoke<Memory>("update_memory", { id, input });

export const deleteMemory = (id: number): Promise<void> =>
  invoke<void>("delete_memory", { id });

export const toggleArchive = (id: number, archived: boolean): Promise<Memory> =>
  invoke<Memory>("toggle_archive", { id, archived });
