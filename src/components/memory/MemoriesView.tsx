import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Archive,
  ArchiveRestore,
  Search,
  X,
  Save,
} from "lucide-react";
import {
  addMemory,
  deleteMemory,
  listMemories,
  toggleArchive,
  updateMemory,
} from "../../lib/ipc";
import type { Memory, MemorySource } from "../../types";

const SOURCES: (MemorySource | "all")[] = ["all", "chat", "manual"];

export default function MemoriesView() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<MemorySource | "all">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Editor / add modal
  const [editing, setEditing] = useState<Memory | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const ms = await listMemories();
      setMemories(ms);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    memories.forEach((m) => m.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [memories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memories
      .filter((m) => (showArchived ? true : !m.archived))
      .filter((m) => (sourceFilter === "all" ? true : m.source === sourceFilter))
      .filter((m) => (tagFilter ? m.tags.includes(tagFilter) : true))
      .filter((m) =>
        q
          ? m.content.toLowerCase().includes(q) ||
            (m.summary ?? "").toLowerCase().includes(q) ||
            m.tags.some((t) => t.toLowerCase().includes(q))
          : true
      )
      .sort((a, b) => {
        // Active first by importance desc, then recency.
        if (b.importance !== a.importance) {
          return b.importance - a.importance;
        }
        return b.updatedAt - a.updatedAt;
      });
  }, [memories, query, sourceFilter, tagFilter, showArchived]);

  const onDelete = async (id: number) => {
    if (!confirm("删除这条记忆？删除后 AI 将不再记得它。")) return;
    try {
      await deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(String(e));
    }
  };

  const onArchive = async (m: Memory) => {
    try {
      const updated = await toggleArchive(m.id, !m.archived);
      setMemories((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-[var(--lumen-border)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">记忆管理</h1>
            <p className="text-xs text-[var(--lumen-muted)]">
              共 {memories.length} 条 · 显示 {filtered.length} 条
            </p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 rounded-lg bg-[var(--lumen-accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Plus size={14} /> 手动添加
          </button>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--lumen-border)] px-6 py-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--lumen-muted)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索内容 / 摘要 / 标签"
            className="w-64 rounded-lg border border-[var(--lumen-border)] bg-[var(--lumen-bg)] py-1.5 pl-8 pr-3 text-xs outline-none focus:border-[var(--lumen-accent)]"
          />
        </div>
        <select
          value={sourceFilter}
          onChange={(e) =>
            setSourceFilter(e.target.value as MemorySource | "all")
          }
          className="rounded-lg border border-[var(--lumen-border)] bg-[var(--lumen-bg)] px-2 py-1.5 text-xs outline-none"
        >
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "全部来源" : s === "chat" ? "对话产生" : "手动添加"}
            </option>
          ))}
        </select>
        <select
          value={tagFilter ?? ""}
          onChange={(e) => setTagFilter(e.target.value || null)}
          className="rounded-lg border border-[var(--lumen-border)] bg-[var(--lumen-bg)] px-2 py-1.5 text-xs outline-none"
        >
          <option value="">全部标签</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-[var(--lumen-muted)]">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-[var(--lumen-accent)]"
          />
          显示已归档
        </label>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="mb-3 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-[var(--lumen-muted)]">加载中…</p>
        ) : filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--lumen-muted)]">
            没有匹配的记忆。
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((m) => (
              <MemoryCard
                key={m.id}
                memory={m}
                onEdit={() => setEditing(m)}
                onDelete={() => onDelete(m.id)}
                onArchive={() => onArchive(m)}
              />
            ))}
          </div>
        )}
      </div>

      {(editing || adding) && (
        <MemoryEditor
          memory={editing}
          onClose={() => {
            setEditing(null);
            setAdding(false);
          }}
          onSaved={async () => {
            await reload();
            setEditing(null);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function MemoryCard({
  memory,
  onEdit,
  onDelete,
  onArchive,
}: {
  memory: Memory;
  onEdit: () => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="group rounded-lg border border-[var(--lumen-border)] bg-[var(--lumen-panel)] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {memory.summary && (
            <p className="mb-0.5 text-xs font-medium text-[var(--lumen-muted)]">
              {memory.summary}
            </p>
          )}
          <p
            className={
              "text-sm " +
              (memory.archived ? "text-[var(--lumen-muted)] line-through" : "")
            }
          >
            {memory.content}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-[#1f2530] px-1.5 py-0.5 text-[10px] text-[var(--lumen-muted)]">
              {memory.source === "chat" ? "对话" : "手动"}
            </span>
            <span className="rounded bg-[#1f2530] px-1.5 py-0.5 text-[10px] text-[var(--lumen-muted)]">
              重要度 {memory.importance}
            </span>
            {memory.tags.map((t) => (
              <span
                key={t}
                className="rounded bg-[var(--lumen-accent)]/15 px-1.5 py-0.5 text-[10px] text-[var(--lumen-accent)]"
              >
                #{t}
              </span>
            ))}
            {memory.archived && (
              <span className="rounded bg-yellow-900/40 px-1.5 py-0.5 text-[10px] text-yellow-300">
                已归档
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={onArchive}
            title={memory.archived ? "取消归档" : "归档"}
            className="rounded p-1 text-[var(--lumen-muted)] hover:bg-[#1f2530] hover:text-[var(--lumen-text)]"
          >
            {memory.archived ? (
              <ArchiveRestore size={14} />
            ) : (
              <Archive size={14} />
            )}
          </button>
          <button
            onClick={onEdit}
            title="编辑"
            className="rounded p-1 text-[var(--lumen-muted)] hover:bg-[#1f2530] hover:text-[var(--lumen-text)]"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            title="删除"
            className="rounded p-1 text-[var(--lumen-muted)] hover:bg-red-950/50 hover:text-red-300"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MemoryEditor({
  memory,
  onClose,
  onSaved,
}: {
  memory: Memory | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState(memory?.content ?? "");
  const [summary, setSummary] = useState(memory?.summary ?? "");
  const [tags, setTags] = useState((memory?.tags ?? []).join(", "));
  const [importance, setImportance] = useState(memory?.importance ?? 5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    const tagArr = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      if (memory) {
        await updateMemory(memory.id, {
          content,
          summary: summary || null,
          tags: tagArr,
          importance,
        });
      } else {
        await addMemory({
          content,
          summary: summary || null,
          tags: tagArr,
          importance,
          source: "manual",
        });
      }
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-xl border border-[var(--lumen-border)] bg-[var(--lumen-panel)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {memory ? "编辑记忆" : "添加记忆"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--lumen-muted)] hover:text-[var(--lumen-text)]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--lumen-muted)]">
              摘要 (可选)
            </label>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full rounded-lg border border-[var(--lumen-border)] bg-[var(--lumen-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--lumen-accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--lumen-muted)]">
              内容
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-[var(--lumen-border)] bg-[var(--lumen-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--lumen-accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--lumen-muted)]">
              标签 (逗号分隔)
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="AI, 手机, 学习"
              className="w-full rounded-lg border border-[var(--lumen-border)] bg-[var(--lumen-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--lumen-accent)]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--lumen-muted)]">
              重要度: {importance}
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={importance}
              onChange={(e) => setImportance(Number(e.target.value))}
              className="w-full accent-[var(--lumen-accent)]"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-[var(--lumen-border)] px-4 py-2 text-sm text-[var(--lumen-muted)] hover:text-[var(--lumen-text)]"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saving || !content.trim()}
            className="flex items-center gap-2 rounded-lg bg-[var(--lumen-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Save size={14} /> {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
