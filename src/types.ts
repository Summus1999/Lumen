// Shared types mirroring the Rust structs in src-tauri/src.
// Keep these in sync with commands.rs / db / memory modules.

export type MemorySource = "chat" | "manual";

export interface Memory {
  id: number;
  content: string;
  summary: string | null;
  source: MemorySource;
  importance: number; // 1..=10
  tags: string[];
  createdAt: number; // unix ms
  updatedAt: number; // unix ms
  archived: boolean;
}

/** Payload for creating or updating a memory from the frontend. */
export interface MemoryInput {
  content: string;
  summary?: string | null;
  importance?: number;
  tags?: string[];
  source?: MemorySource;
  archived?: boolean;
}

export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  id: number;
  conversationId: number;
  role: MessageRole;
  content: string;
  createdAt: number;
}

export interface Conversation {
  id: number;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A chat turn sent to the backend `chat` command. */
export interface ChatTurn {
  conversationId: number | null;
  userMessage: string;
}

/** Result of a chat turn: the assistant reply plus bookkeeping. */
export interface ChatResult {
  conversationId: number;
  userMessageId: number;
  assistantMessageId: number;
  assistantContent: string;
  /** Memories injected into the system prompt for this turn. */
  retrievedMemoryIds: number[];
  /** Memories freshly extracted from this turn (may be empty). */
  extractedMemoryIds: number[];
}

/** A single memory returned by RAG retrieval, with its similarity score. */
export interface RetrievedMemory {
  memory: Memory;
  score: number; // cosine similarity, 0..1
}

export interface AppSettings {
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  baseUrl: string;
}

/** Facts the LLM extractor pulled out of a conversation. */
export interface ExtractedFact {
  content: string;
  importance: number; // 1..=10
  tags: string[];
}
