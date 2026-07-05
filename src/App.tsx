import { useEffect } from "react";
import { Routes, Route, NavLink, useLocation } from "react-router-dom";
import { Brain, MessageSquare, Settings as SettingsIcon } from "lucide-react";
import { useUIStore } from "./lib/store";
import { getSettings } from "./lib/ipc";
import ChatView from "./components/chat/ChatView";
import MemoriesView from "./components/memory/MemoriesView";
import SettingsView from "./components/settings/SettingsView";

export default function App() {
  const setSettings = useUIStore((s) => s.setSettings);
  const setSettingsLoading = useUIStore((s) => s.setSettingsLoading);
  const location = useLocation();

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
        // Settings don't exist yet — that's fine, user will fill them in.
        if (alive) setSettingsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [setSettings, setSettingsLoading]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <nav className="flex w-14 flex-col items-center gap-1 border-r border-[var(--lumen-border)] bg-[var(--lumen-panel)] py-3">
        <NavLink
          to="/"
          className={
            "flex h-10 w-10 items-center justify-center rounded-lg transition-colors " +
            (location.pathname === "/"
              ? "bg-[var(--lumen-accent)] text-white"
              : "text-[var(--lumen-muted)] hover:bg-[#1f2530] hover:text-[var(--lumen-text)]")
          }
          title="聊天"
        >
          <MessageSquare size={18} />
        </NavLink>
        <NavLink
          to="/memories"
          className={({ isActive }) =>
            "flex h-10 w-10 items-center justify-center rounded-lg transition-colors " +
            (isActive
              ? "bg-[var(--lumen-accent)] text-white"
              : "text-[var(--lumen-muted)] hover:bg-[#1f2530] hover:text-[var(--lumen-text)]")
          }
          title="记忆管理"
        >
          <Brain size={18} />
        </NavLink>
        <div className="flex-1" />
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            "flex h-10 w-10 items-center justify-center rounded-lg transition-colors " +
            (isActive
              ? "bg-[var(--lumen-accent)] text-white"
              : "text-[var(--lumen-muted)] hover:bg-[#1f2530] hover:text-[var(--lumen-text)]")
          }
          title="设置"
        >
          <SettingsIcon size={18} />
        </NavLink>
      </nav>

      {/* Main content */}
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
