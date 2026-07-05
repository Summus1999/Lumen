import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, Plus, Send, Settings as SettingsIcon, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useUIStore } from "../../lib/store";
import {
  chat as chatIpc,
  listConversations,
  listMessages,
} from "../../lib/ipc";
import { formatTime, conversationGroup } from "../../lib/time";
import type { Conversation } from "../../types";

interface UITurn {
  role: "user" | "assistant";
  content: string;
  /** 创建时间，unix 毫秒。乐观消息用 Date.now()，真实消息用后端返回的 createdAt。 */
  createdAt: number;
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

  // 新消息时自动滚动到底部。
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
          createdAt: m.createdAt,
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
    // 乐观地先展示用户消息 + 一个待定的助手占位。
    const now = Date.now();
    setTurns((prev) => [
      ...prev,
      { role: "user", content: text, createdAt: now },
      { role: "assistant", content: "", createdAt: now, pending: true },
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
            next[i] = { role: "assistant", content: result.assistantContent, createdAt: Date.now() };
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
              createdAt: Date.now(),
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

  const startNewChat = () => {
    setTurns([]);
    setCurrentId(null);
    // 改为在第一条消息时再懒创建对话记录。
  };

  if (settingsLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        加载中…
      </div>
    );
  }

  // 未配置 API Key 的空状态：插画式布局，引导用户前往设置。
  if (!hasApiKey) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-gradient-subtle">
          <Sparkles size={32} className="text-accent" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-text">欢迎使用 Lumen</h2>
          <p className="text-sm text-muted">
            先去设置里填入 GLM API Key，然后回来开始聊天。
          </p>
        </div>
        <Link
          to="/settings"
          className="flex items-center gap-2 rounded-md bg-accent-gradient px-4 py-2 text-sm font-medium text-text-inverse shadow-accent-glow transition-transform duration-fast ease-standard hover:-translate-y-px"
        >
          <SettingsIcon size={14} /> 前往设置
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* 对话侧边栏：半透明 + 毛玻璃，透出 body 光晕 */}
      <aside className="glass-panel flex w-48 flex-col border-r border-border-subtle">
        <button
          onClick={startNewChat}
          className="m-2 flex items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-muted transition-colors duration-fast ease-standard hover:border-border-strong hover:text-text"
        >
          <Plus size={14} /> 新对话
        </button>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-text-tertiary">
              还没有对话
            </p>
          )}
          {groupConversations(conversations).map(({ label, items }) => (
            <div key={label} className="mb-2">
              <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-text-tertiary">
                {label}
              </div>
              {items.map((c) => (
                <button
                  key={c.id}
                  onClick={() => loadMessages(c.id)}
                  className={
                    "mb-0.5 block w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors duration-fast ease-standard " +
                    (currentId === c.id
                      ? "bg-accent-gradient-subtle text-text"
                      : "text-muted hover:bg-panel-hover hover:text-text")
                  }
                  title={c.title ?? `对话 ${c.id}`}
                >
                  {c.title ?? `对话 ${c.id}`}
                </button>
              ))}
            </div>
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
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-gradient-subtle">
                <Sparkles size={28} className="text-accent" />
              </div>
              <p className="text-sm text-muted">
                随便聊点什么——我会自动记下关于你的事。
              </p>
            </div>
          )}
          {turns.map((t, i) => (
            <MessageBubble key={i} turn={t} />
          ))}
        </div>

        {/* 输入框：毛玻璃背景 + 聚焦态 accent 高光 */}
        <div className="border-t border-border-subtle px-6 py-3">
          <div className="focus-accent flex items-end gap-2 rounded-lg border border-border bg-bg-sunken px-3 py-2 transition-all duration-fast ease-standard">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="输入消息，Enter 发送，Shift+Enter 换行"
              className="max-h-40 flex-1 resize-none bg-transparent text-sm text-text outline-none placeholder:text-text-tertiary"
            />
            <button
              onClick={onSend}
              disabled={sending || !input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-gradient text-text-inverse transition-opacity duration-fast ease-standard hover:opacity-90 disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * 把对话按 createdAt 归类到"今天/昨天/更早"三组，便于侧边栏分段展示。
 * 返回顺序固定为 今天 → 昨天 → 更早，空组不返回。
 */
function groupConversations(
  convs: Conversation[]
): { label: string; items: Conversation[] }[] {
  const groups: Record<string, Conversation[]> = {
    今天: [],
    昨天: [],
    更早: [],
  };
  for (const c of convs) {
    groups[conversationGroup(c.updatedAt)].push(c);
  }
  return ["今天", "昨天", "更早"]
    .filter((label) => groups[label].length > 0)
    .map((label) => ({ label, items: groups[label] }));
}

function MessageBubble({ turn }: { turn: UITurn }) {
  const isUser = turn.role === "user";
  const [copied, setCopied] = useState(false);

  // 复制助手消息内容到剪贴板，短暂切换图标为 Check 反馈成功。
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(turn.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 剪贴板不可用时静默失败，不影响阅读。
    }
  };

  return (
    <div className={"group flex gap-2 " + (isUser ? "justify-end" : "justify-start")}>
      {/* 助手头像：仅助手消息显示，accent 渐变背景 + Sparkles */}
      {!isUser && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-gradient">
          <Sparkles size={16} className="text-text-inverse" />
        </div>
      )}

      <div className="flex max-w-[78%] flex-col">
        <div
          className={
            "px-4 py-2 text-sm " +
            (isUser
              ? "rounded-lg rounded-br-sm bg-accent-gradient text-text-inverse"
              : turn.error
                ? "rounded-lg rounded-bl-sm border border-danger/30 bg-danger-subtle text-danger"
                : "glass-panel rounded-lg rounded-bl-sm")
          }
        >
          {turn.pending ? (
            <span className="inline-flex items-center gap-1.5 text-muted">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
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

        {/* 元信息行：时间戳 + 复制按钮（仅助手消息 hover 显示） */}
        <div
          className={
            "mt-1 flex items-center gap-2 px-1 text-[10px] text-text-tertiary " +
            (isUser ? "justify-end" : "justify-start")
          }
        >
          <span>{formatTime(turn.createdAt)}</span>
          {!isUser && !turn.pending && !turn.error && (
            <button
              onClick={onCopy}
              className="opacity-0 transition-opacity duration-fast ease-standard group-hover:opacity-100 hover:text-text"
              title="复制"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
