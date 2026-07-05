// 与 src-tauri/src 中 Rust 结构体对应的共享类型。
// 请保持与 commands.rs / db / memory 模块同步。

export type MemorySource = "chat" | "manual";

/** 5 层记忆分类，与后端 MemoryLayer 枚举对应。 */
export type MemoryLayer =
  | "personal"
  | "technical"
  | "preference"
  | "session"
  | "page";

export interface Memory {
  id: number;
  content: string;
  summary: string | null;
  source: MemorySource;
  importance: number; // 1..=10
  tags: string[];
  createdAt: number; // Unix 毫秒
  updatedAt: number;
  archived: boolean;
  /** 5 层分类。 */
  layer: MemoryLayer;
  /** 仅 session 层：关联到具体会话。 */
  conversationId: number | null;
  /** 仅 page 层：话题/领域标签。 */
  topic: string | null;
}

/** 前端用于创建或更新记忆的载荷。 */
export interface MemoryInput {
  content: string;
  summary?: string | null;
  importance?: number;
  tags?: string[];
  source?: MemorySource;
  archived?: boolean;
  layer?: MemoryLayer;
  conversationId?: number | null;
  topic?: string | null;
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

/** 发送给后端 chat 命令的一次对话轮次。 */
export interface ChatTurn {
  conversationId: number | null;
  userMessage: string;
}

/** 一次对话轮次的结果：助手回复及附带信息。 */
export interface ChatResult {
  conversationId: number;
  userMessageId: number;
  assistantMessageId: number;
  assistantContent: string;
  /** 注入到本轮系统提示中的记忆。 */
  retrievedMemoryIds: number[];
  /** 从本轮对话中新提取的记忆（可能为空）。 */
  extractedMemoryIds: number[];
}

/** RAG 检索返回的单条记忆及其相似度分数。 */
export interface RetrievedMemory {
  memory: Memory;
  score: number; // 余弦相似度，0..1
}

export interface AppSettings {
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  baseUrl: string;
}

/** LLM 抽取器从对话中提取出的事实。 */
export interface ExtractedFact {
  content: string;
  importance: number; // 1..=10
  tags: string[];
}
