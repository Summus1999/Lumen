import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Cpu,
  Check,
  ChevronDown,
  KeyRound,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useUIStore } from "../../lib/store";
import { getSettings, saveSettings } from "../../lib/ipc";
import type { AppSettings } from "../../types";

const DEFAULT_SETTINGS: AppSettings = {
  apiKey: "",
  chatModel: "glm-4-flash",
  embeddingModel: "embedding-3",
  baseUrl: "https://open.bigmodel.cn/api/paas/v4",
};

const CHAT_MODELS = [
  "glm-4-flash",
  "glm-4-flashx",
  "glm-4-air",
  "glm-4-airx",
  "glm-4-plus",
  "glm-4-long",
];

const EMBEDDING_MODELS = ["embedding-3"];

export default function SettingsView() {
  const navigate = useNavigate();
  const setSettings = useUIStore((s) => s.setSettings);
  const setHasApiKey = useUIStore((s) => s.setHasApiKey);
  const [form, setForm] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSettings()
      .then((s) => setForm({ ...DEFAULT_SETTINGS, ...s }))
      .catch(() => setForm(DEFAULT_SETTINGS));
  }, []);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const savedSettings = await saveSettings(form);
      setSettings(savedSettings);
      setHasApiKey(!!savedSettings.apiKey);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="border-b border-border-subtle px-6 py-4">
        <h1 className="text-lg font-semibold text-text">设置</h1>
        <p className="text-xs text-muted">
          配置 GLM (智谱) API 凭证与模型。所有数据只保存在本机。
        </p>
      </header>

      <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-6">
        {/* API Key 风险提示卡片：强调本地存储，不上传 */}
        <div className="flex items-start gap-3 rounded-lg border border-info/20 bg-info-subtle px-4 py-3">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-info" />
          <div className="text-xs text-text-secondary">
            密钥仅存于本地 <code className="rounded bg-bg-sunken px-1 py-0.5 font-mono text-text">lumen.db</code>，不会上传到任何服务器。Lumen 唯一的网络出站是 GLM API。
          </div>
        </div>

        {/* API 配置分组卡片 */}
        <section className="rounded-lg border border-border bg-panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound size={14} className="text-accent" />
            <h2 className="text-sm font-semibold text-text">API 配置</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted">API Key</label>
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                placeholder="在 open.bigmodel.cn 控制台获取"
                className="focus-accent w-full rounded-md border border-border bg-bg-sunken px-3 py-2 text-sm text-text outline-none transition-all duration-fast ease-standard"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted">API Base URL</label>
              <input
                type="text"
                value={form.baseUrl}
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                className="focus-accent w-full rounded-md border border-border bg-bg-sunken px-3 py-2 text-sm text-text outline-none transition-all duration-fast ease-standard font-mono"
              />
            </div>
          </div>
        </section>

        {/* 模型选择分组卡片 */}
        <section className="rounded-lg border border-border bg-panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Cpu size={14} className="text-accent" />
            <h2 className="text-sm font-semibold text-text">模型选择</h2>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted">对话模型</label>
              <SelectInput
                value={form.chatModel}
                onChange={(v) => setForm({ ...form, chatModel: v })}
                options={CHAT_MODELS.map((m) => ({ value: m, label: m }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted">
                向量模型 (用于记忆检索)
              </label>
              <SelectInput
                value={form.embeddingModel}
                onChange={(v) => setForm({ ...form, embeddingModel: v })}
                options={EMBEDDING_MODELS.map((m) => ({ value: m, label: m }))}
              />
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-md border border-danger/30 bg-danger-subtle px-3 py-2 text-xs text-danger">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-md bg-accent-gradient px-4 py-2 text-sm font-medium text-text-inverse shadow-accent-glow transition-opacity duration-fast ease-standard hover:opacity-90 disabled:opacity-50"
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saving ? "保存中…" : saved ? "已保存" : "保存"}
          </button>
          <button
            onClick={() => navigate("/")}
            className="rounded-md border border-border px-4 py-2 text-sm text-muted transition-colors duration-fast ease-standard hover:border-border-strong hover:text-text"
          >
            返回聊天
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 带 ChevronDown 图标的样式化 select，与 MemoriesView 的 SelectInput 风格一致。
 * 原生 select 箭头在深色主题下不可控，用 appearance:none + 自定义图标覆盖。
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
        className="focus-accent appearance-none w-full rounded-md border border-border bg-bg-sunken py-2 pl-3 pr-9 text-sm text-text outline-none transition-all duration-fast ease-standard"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary"
      />
    </div>
  );
}
