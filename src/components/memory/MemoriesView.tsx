import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Brain,
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  addMemory,
  deleteMemory,
  listMemories,
  toggleArchive,
  updateMemory,
} from "../../lib/ipc";
import { formatRelative } from "../../lib/time";
import Badge from "../ui/Badge";
import type { Memory, MemoryLayer, MemorySource } from "../../types";

const SOURCES: (MemorySource | "all")[] = ["all", "chat", "manual"];

/** 5 层 tab 配置：label 显示名，tone 对应 Badge 语义色。 */
const LAYER_TABS: { value: MemoryLayer | "all"; label: string; tone: "neutral" | "danger" | "info" | "accent" | "warning" }[] = [
  { value: "all", label: "全部", tone: "neutral" },
  { value: "personal", label: "个人", tone: "danger" },
  { value: "technical", label: "技术", tone: "info" },
  { value: "preference", label: "偏好", tone: "accent" },
  { value: "session", label: "会话", tone: "neutral" },
  { value: "page", label: "话题", tone: "warning" },
];

/** Editor 里用的层选项（不含 all）。 */
const LAYER_OPTIONS: { value: MemoryLayer; label: string }[] = [
  { value: "personal", label: "个人（不可删除）" },
  { value: "technical", label: "技术" },
  { value: "preference", label: "偏好" },
  { value: "session", label: "会话" },
  { value: "page", label: "话题" },
];

const LAYER_TONE: Record<MemoryLayer, "neutral" | "danger" | "info" | "accent" | "warning"> = {
  personal: "danger",
  technical: "info",
  preference: "accent",
  session: "neutral",
  page: "warning",
};

const LAYER_LABEL: Record<MemoryLayer, string> = {
  personal: "个人",
  technical: "技术",
  preference: "偏好",
  session: "会话",
  page: "话题",
};

export default function MemoriesView() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // layer tab：all 表示全部层
  const [layerTab, setLayerTab] = useState<MemoryLayer | "all">("all");

  // 过滤器
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<MemorySource | "all">("all");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // 编辑器 / 添加弹窗
  const [editing, setEditing] = useState<Memory | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      // 按 layer tab 拉取：all 拉全部，否则拉对应层。
      const ms = await listMemories(layerTab === "all" ? undefined : layerTab);
      setMemories(ms);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, [layerTab]);

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
        // 未归档的优先按重要度降序，再按时间降序。
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
      // personal 层删除会被后端拒绝，错误信息展示给用户。
      setError(String(e));
    }
  };

  const onArchive = async (m: Memory) => {
    try {
      const updated = await toggleArchive(m.id, !m.archived);
      setMemories((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e) {
      // personal 层归档会被后端拒绝。
      setError(String(e));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border-subtle px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-text">记忆管理</h1>
            <p className="text-xs text-muted">
              共 {memories.length} 条 · 显示 {filtered.length} 条
            </p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 rounded-md bg-accent-gradient px-3 py-2 text-sm font-medium text-text-inverse shadow-accent-glow transition-transform duration-fast ease-standard hover:-translate-y-px"
          >
            <Plus size={14} /> 手动添加
          </button>
        </div>
      </header>

      {/* 层级 tab 栏：全部 / 个人 / 技术 / 偏好 / 会话 / 话题 */}
      <div className="flex items-center gap-1 border-b border-border-subtle px-6 py-2">
        {LAYER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setLayerTab(tab.value)}
            className={
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-fast ease-standard " +
              (layerTab === tab.value
                ? "bg-accent-gradient-subtle text-accent"
                : "text-muted hover:bg-glass-highlight hover:text-text")
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 过滤器栏：搜索框 + 来源/标签下拉 + 显示已归档复选框 */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-6 py-3">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索内容 / 摘要 / 标签"
            className="focus-accent w-64 rounded-md border border-border bg-bg-sunken py-1.5 pl-8 pr-3 text-xs text-text outline-none transition-all duration-fast ease-standard"
          />
        </div>
        <SelectInput
          value={sourceFilter}
          onChange={(v) => setSourceFilter(v as MemorySource | "all")}
          options={SOURCES.map((s) => ({
            value: s,
            label: s === "all" ? "全部来源" : s === "chat" ? "对话产生" : "手动添加",
          }))}
        />
        <SelectInput
          value={tagFilter ?? ""}
          onChange={(v) => setTagFilter(v || null)}
          options={[
            { value: "", label: "全部标签" },
            ...allTags.map((t) => ({ value: t, label: t })),
          ]}
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="accent-accent"
          />
          显示已归档
        </label>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="mb-3 rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-sm text-muted">加载中…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-gradient-subtle">
              <Brain size={28} className="text-accent" />
            </div>
            <p className="text-sm text-muted">
              {memories.length === 0 ? "还没有记忆，聊几句让 Lumen 记住你。" : "没有匹配的记忆。"}
            </p>
          </div>
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

/**
 * 带 ChevronDown 图标的样式化 select。
 * 原生 select 的箭头在深色主题下不可控，用 appearance:none + 自定义图标覆盖。
 */
function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-accent appearance-none rounded-md border border-border bg-bg-sunken py-1.5 pl-3 pr-8 text-xs text-text outline-none transition-all duration-fast ease-standard"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary"
      />
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
  // personal 层：删除和归档按钮置灰（后端也会拒绝，这里做 UX 提示）。
  const isPersonal = memory.layer === "personal";

  return (
    <div className="group rounded-lg border border-border bg-panel px-4 py-3 transition-all duration-fast ease-standard hover:-translate-y-px hover:border-border-strong hover:bg-panel-glass hover:shadow-e2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {memory.summary && (
            <p className="mb-0.5 text-xs font-medium text-text-tertiary">
              {memory.summary}
            </p>
          )}
          <p
            className={
              "text-sm " +
              (memory.archived ? "text-text-tertiary line-through" : "text-text")
            }
          >
            {memory.content}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={LAYER_TONE[memory.layer]}>{LAYER_LABEL[memory.layer]}</Badge>
            <Badge tone="info">{memory.source === "chat" ? "对话" : "手动"}</Badge>
            <Badge tone="accent">重要度 {memory.importance}</Badge>
            {memory.topic && <Badge tone="warning">话题：{memory.topic}</Badge>}
            {memory.tags.map((t) => (
              <Badge key={t} tone="neutral">
                #{t}
              </Badge>
            ))}
            {memory.archived && <Badge tone="warning">已归档</Badge>}
            {/* 时间戳：相对时间 + 编辑标记 */}
            <span className="ml-auto text-[10px] text-text-tertiary">
              {formatRelative(memory.createdAt)}
              {memory.updatedAt !== memory.createdAt && " · 已编辑"}
            </span>
          </div>
        </div>
        {/* 操作按钮组：hover 显示。personal 层禁用删除/归档。 */}
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-fast ease-standard group-hover:opacity-100">
          <button
            onClick={onArchive}
            disabled={isPersonal}
            title={isPersonal ? "个人记忆不可归档" : memory.archived ? "取消归档" : "归档"}
            className="rounded p-1 text-muted transition-colors duration-fast ease-standard hover:bg-glass-highlight hover:text-text disabled:cursor-not-allowed disabled:opacity-30"
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
            className="rounded p-1 text-muted transition-colors duration-fast ease-standard hover:bg-glass-highlight hover:text-text"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={onDelete}
            disabled={isPersonal}
            title={isPersonal ? "个人记忆不可删除" : "删除"}
            className="rounded p-1 text-muted transition-colors duration-fast ease-standard hover:bg-danger-subtle hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
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
  const [layer, setLayer] = useState<MemoryLayer>(memory?.layer ?? "preference");
  const [topic, setTopic] = useState(memory?.topic ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // personal 层锁定：编辑已有 personal 记忆时禁止改层。
  // 新建时若选了 personal 也允许（用户主动建个人记忆）。
  const isPersonalLocked = memory?.layer === "personal";

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
          // personal 层锁定时不传 layer（保持原值）。
          layer: isPersonalLocked ? undefined : layer,
          // page 层传 topic，其它层传 null 清空。
          topic: layer === "page" ? (topic.trim() || null) : null,
        });
      } else {
        await addMemory({
          content,
          summary: summary || null,
          tags: tagArr,
          importance,
          layer,
          source: "manual",
          topic: layer === "page" ? (topic.trim() || null) : null,
        });
      }
      onSaved();
    } catch (e) {
      // 后端会拒绝非法的 layer 转换（如 personal 与其它层互转）。
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    // 遮罩：毛玻璃化；面板：scale_in 进场动画
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-glass-overlay animate-fade-in"
      style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-lg rounded-lg p-5 shadow-e3 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">
            {memory ? "编辑记忆" : "添加记忆"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted transition-colors duration-fast ease-standard hover:text-text"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {/* 层级选择器：personal 层锁定 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted">层级</label>
            <SelectInput
              value={isPersonalLocked ? "personal" : layer}
              onChange={(v) => setLayer(v as MemoryLayer)}
              options={
                isPersonalLocked
                  ? [{ value: "personal", label: "个人（锁定）" }]
                  : LAYER_OPTIONS
              }
            />
            {isPersonalLocked && (
              <p className="text-[10px] text-text-tertiary">个人记忆锁定层级，不可改为其它层。</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted">摘要 (可选)</label>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="focus-accent w-full rounded-md border border-border bg-bg-sunken px-3 py-2 text-sm text-text outline-none transition-all duration-fast ease-standard"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">内容</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="focus-accent w-full resize-none rounded-md border border-border bg-bg-sunken px-3 py-2 text-sm text-text outline-none transition-all duration-fast ease-standard"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              标签 (逗号分隔)
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="AI, 手机, 学习"
              className="focus-accent w-full rounded-md border border-border bg-bg-sunken px-3 py-2 text-sm text-text outline-none transition-all duration-fast ease-standard"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">
              重要度: {importance}
            </label>
            <input
              type="range"
              min={1}
              max={10}
              value={importance}
              onChange={(e) => setImportance(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
          {/* 仅 page 层显示话题输入框 */}
          {layer === "page" && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted">话题 (仅话题层)</label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="如：React 项目、Tauri 开发"
                className="focus-accent w-full rounded-md border border-border bg-bg-sunken px-3 py-2 text-sm text-text outline-none transition-all duration-fast ease-standard"
              />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-4 py-2 text-sm text-muted transition-colors duration-fast ease-standard hover:border-border-strong hover:text-text"
          >
            取消
          </button>
          <button
            onClick={onSave}
            disabled={saving || !content.trim()}
            className="flex items-center gap-2 rounded-md bg-accent-gradient px-4 py-2 text-sm font-medium text-text-inverse shadow-accent-glow transition-opacity duration-fast ease-standard hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Check size={14} /> : <Save size={14} />}{" "}
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
