import { useEffect } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { Brain, MessageSquare, Settings as SettingsIcon, Sparkles } from "lucide-react";
import { useUIStore } from "./lib/store";
import { getSettings } from "./lib/ipc";
import Tooltip from "./components/ui/Tooltip";
import ChatView from "./components/chat/ChatView";
import MemoriesView from "./components/memory/MemoriesView";
import SettingsView from "./components/settings/SettingsView";

export default function App() {
  const setSettings = useUIStore((s) => s.setSettings);
  const setSettingsLoading = useUIStore((s) => s.setSettingsLoading);

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((s) => {
        if (alive) {
          setSettings(s);
          setSettingsLoading(false);
        }
      })
      .catch(() => {
        // 设置还不存在——没关系，用户会自行填写。
        if (alive) setSettingsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [setSettings, setSettingsLoading]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* 主侧边栏：64px 宽，毛玻璃背景，顶部品牌区 + 导航 + 底部设置 */}
      <nav className="glass-panel flex w-16 flex-col items-center gap-1 border-r border-border-subtle py-3">
        {/* 品牌区：Lumen Logo，accent 渐变填充 */}
        <div className="mb-2 flex h-10 w-10 items-center justify-center" title="Lumen">
          <Sparkles className="text-accent-gradient" size={22} />
        </div>

        {/* 导航项：统一用 isActive 函数式 className，激活态用渐变 + 发光 */}
        <Tooltip label="聊天">
          <NavLink
            to="/"
            className={({ isActive }) =>
              "flex h-10 w-10 items-center justify-center rounded-md transition-colors duration-fast ease-standard " +
              (isActive
                ? "bg-accent-gradient text-text-inverse shadow-accent-glow"
                : "text-muted hover:bg-glass-highlight hover:text-text")
            }
          >
            <MessageSquare size={18} />
          </NavLink>
        </Tooltip>
        <Tooltip label="记忆管理">
          <NavLink
            to="/memories"
            className={({ isActive }) =>
              "flex h-10 w-10 items-center justify-center rounded-md transition-colors duration-fast ease-standard " +
              (isActive
                ? "bg-accent-gradient text-text-inverse shadow-accent-glow"
                : "text-muted hover:bg-glass-highlight hover:text-text")
            }
          >
            <Brain size={18} />
          </NavLink>
        </Tooltip>

        <div className="flex-1" />

        <Tooltip label="设置">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              "flex h-10 w-10 items-center justify-center rounded-md transition-colors duration-fast ease-standard " +
              (isActive
                ? "bg-accent-gradient text-text-inverse shadow-accent-glow"
                : "text-muted hover:bg-glass-highlight hover:text-text")
            }
          >
            <SettingsIcon size={18} />
          </NavLink>
        </Tooltip>
      </nav>

      {/* 主内容区 */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<ChatView />} />
          <Route path="/memories" element={<MemoriesView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </main>
    </div>
  );
}
