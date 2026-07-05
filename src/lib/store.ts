import { create } from "zustand";
import type { AppSettings } from "../types";

interface UIState {
  /** 在首次设置加载完成前为 true。 */
  settingsLoading: boolean;
  /** 当前设置；apiKey 在用户填写前为空字符串。 */
  settings: AppSettings | null;
  setSettings: (s: AppSettings) => void;
  setSettingsLoading: (b: boolean) => void;

  /** 用户是否已配置 API Key（控制空状态提示）。 */
  hasApiKey: boolean;
  setHasApiKey: (b: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  settingsLoading: true,
  settings: null,
  setSettings: (s) => set({ settings: s, hasApiKey: !!s.apiKey }),
  setSettingsLoading: (b) => set({ settingsLoading: b }),

  hasApiKey: false,
  setHasApiKey: (b) => set({ hasApiKey: b }),
}));
