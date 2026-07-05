import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Send, Settings as SettingsIcon, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useUIStore } from "../../lib/store";
import {
  chat as chatIpc,
  listConversations,
  listMessages,
} from "../../lib/ipc";
import type { Conversation } from "../../types";

interface UITurn {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
  error?: boolean;
}

export default function ChatView() {
  const hasApiKey = useUIStore((s) => s.hasApiKey);
  const settingsLoading = useUIStore((s) => s.settingsLoading);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [turns, setTurns] = useState<UITurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 挂载时加载对话列表。
  useEffect(() => {
    listConversations()
      .then((cs) => setConversations(cs))
      .catch(() => {});
  }, []);

  // 新消息时自动滚动。
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  const loadMessages = async (id: number) => {
    const msgs = await listMessages(id);
    setTurns(
      msgs
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
    );
    setCurrentId(id);
  };

  const onSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!hasApiKey) return;

    setSending(true);
    setInput("");
    // 乐观地先展示用户消息。
    setTurns((prev) => [
      ...prev,
      { role: "user", content: text },
      { role: "assistant", content: "", pending: true },
    ]);

    try {
      const result = await chatIpc({
        conversationId: currentId,
        userMessage: text,
      });

      // 如果创建了全新对话，刷新列表。
      if (!currentId) {
        setCurrentId(result.conversationId);
        listConversations().then(setConversations).catch(() => {});
      }

      setTurns((prev) => {
        const next = [...prev];
        // 用真实回复替换待定的助手消息。
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].pending) {
            next[i] = { role: "assistant", content: result.assistantContent };
            break;
          }
        }
        return next;
      });
    } catch (e) {
      setTurns((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].pending) {
            next[i] = {
              role: "assistant",
              content: `调用失败：${String(e)}`,
              error: true,
            };
            break;
          }
        }
        return next;
      });
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const startNewChat = async () => {
    setTurns([]);
    setCurrentId(null);
    // 改为在第一条消息时再懒创建对话记录。
  };

  if (settingsLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--lumen-muted)]">
        加载中…
      </div>
    );
  }

  if (!hasApiKey) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <Sparkles size={32} className="text-[var(--lumen-accent)]" />
        <div>
          <h2 className="text-lg font-semibold">欢迎使用 Lumen</h2>
          <p className="mt-1 text-sm text-[var(--lumen-muted)]">
            先去设置里填入 GLM API Key，然后回来开始聊天。
          </p>
        </div>
        <Link
          to="/settings"
          className="flex items-center gap-2 rounded-lg bg-[var(--lumen-accent)] px-4 py-2 text-sm font-medium text-white"
        >
          <SettingsIcon size={14} /> 前往设置
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* 对话侧边栏 */}
      <aside className="flex w-48 flex-col border-r border-[var(--lumen-border)] bg-[var(--lumen-panel)]">
        <button
          onClick={startNewChat}
          className="m-2 rounded-lg border border-[var(--lumen-border)] px-3 py-2 text-xs text-[var(--lumen-muted)] hover:text-[var(--lumen-text)]"
        >
          + 新对话
        </button>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-[var(--lumen-muted)]">
              还没有对话
            </p>
          )}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => loadMessages(c.id)}
              className={
                "mb-1 block w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors " +
                (currentId === c.id
                  ? "bg-[#1f2530] text-[var(--lumen-text)]"
                  : "text-[var(--lumen-muted)] hover:bg-[#191e26]")
              }
              title={c.title ?? `对话 ${c.id}`}
            >
              {c.title ?? `对话 ${c.id}`}
            </button>
          ))}
        </div>
      </aside>

      {/* 聊天区 */}
      <section className="flex flex-1 flex-col overflow-hidden">
        <div
          ref={scrollRef}
          className="flex-1 space-y-4 overflow-y-auto px-6 py-5"
        >
          {turns.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--lumen-muted)]">
              <Sparkles size={28} className="text-[var(--lumen-accent)]" />
              <p className="text-sm">随便聊点什么——我会自动记下关于你的事。</p>
            </div>
          )}
          {turns.map((t, i) => (
            <MessageBubble key={i} turn={t} />
          ))}
        </div>

        {/* 输入框 */}
        <div className="border-t border-[var(--lumen-border)] px-6 py-3">
          <div className="flex items-end gap-2 rounded-xl border border-[var(--lumen-border)] bg-[var(--lumen-panel)] px-3 py-2 focus-within:border-[var(--lumen-accent)]">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="输入消息，Enter 发送，Shift+Enter 换行"
              className="max-h-40 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-[var(--lumen-muted)]"
            />
            <button
              onClick={onSend}
              disabled={sending || !input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--lumen-accent)] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function MessageBubble({ turn }: { turn: UITurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={"flex " + (isUser ? "justify-end" : "justify-start")}>
      <div
        className={
          "max-w-[78%] rounded-2xl px-4 py-2 text-sm " +
          (isUser
            ? "bg-[var(--lumen-accent)] text-white"
            : turn.error
              ? "border border-red-800 bg-red-950/30 text-red-200"
              : "border border-[var(--lumen-border)] bg-[var(--lumen-panel)]")
        }
      >
        {turn.pending ? (
          <span className="inline-flex items-center gap-1 text-[var(--lumen-muted)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--lumen-muted)]" />
            思考中…
          </span>
        ) : isUser ? (
          <p className="whitespace-pre-wrap">{turn.content}</p>
        ) : (
          <div className="prose-lumen">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {turn.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
