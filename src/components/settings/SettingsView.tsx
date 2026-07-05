import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, KeyRound, Check } from "lucide-react";
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
      const saved = await saveSettings(form);
      setSettings(saved);
      setHasApiKey(!!saved.apiKey);
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
      <header className="border-b border-[var(--lumen-border)] px-6 py-4">
        <h1 className="text-lg font-semibold">设置</h1>
        <p className="text-xs text-[var(--lumen-muted)]">
          配置 GLM (智谱) API 凭证与模型。所有数据只保存在本机。
        </p>
      </header>

      <div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-6">
        {/* API key */}
        <section className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <KeyRound size={14} /> API Key
          </label>
          <input
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder="在 open.bigmodel.cn 控制台获取"
            className="w-full rounded-lg border border-[var(--lumen-border)] bg-[var(--lumen-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--lumen-accent)]"
            autoComplete="off"
          />
          <p className="text-xs text-[var(--lumen-muted)]">
            密钥仅存于本地 lumen.db，不会上传到任何服务器。
          </p>
        </section>

        {/* Base URL */}
        <section className="space-y-2">
          <label className="text-sm font-medium">API Base URL</label>
          <input
            type="text"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
            className="w-full rounded-lg border border-[var(--lumen-border)] bg-[var(--lumen-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--lumen-accent)]"
          />
        </section>

        {/* Chat model */}
        <section className="space-y-2">
          <label className="text-sm font-medium">对话模型</label>
          <select
            value={form.chatModel}
            onChange={(e) => setForm({ ...form, chatModel: e.target.value })}
            className="w-full rounded-lg border border-[var(--lumen-border)] bg-[var(--lumen-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--lumen-accent)]"
          >
            {CHAT_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </section>

        {/* Embedding model */}
        <section className="space-y-2">
          <label className="text-sm font-medium">向量模型 (用于记忆检索)</label>
          <select
            value={form.embeddingModel}
            onChange={(e) =>
              setForm({ ...form, embeddingModel: e.target.value })
            }
            className="w-full rounded-lg border border-[var(--lumen-border)] bg-[var(--lumen-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--lumen-accent)]"
          >
            {EMBEDDING_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </section>

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-[var(--lumen-accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saving ? "保存中…" : saved ? "已保存" : "保存"}
          </button>
          <button
            onClick={() => navigate("/")}
            className="rounded-lg border border-[var(--lumen-border)] px-4 py-2 text-sm text-[var(--lumen-muted)] hover:text-[var(--lumen-text)]"
          >
            返回聊天
          </button>
        </div>
      </div>
    </div>
  );
}
