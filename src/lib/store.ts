import { create } from "zustand";
import type { AppSettings } from "../types";

interface UIState {
  /** True until the first settings load resolves. */
  settingsLoading: boolean;
  /** Current settings; apiKey is empty string until the user fills it in. */
  settings: AppSettings | null;
  setSettings: (s: AppSettings) => void;
  setSettingsLoading: (b: boolean) => void;

  /** Whether the user has configured an API key (drives the empty-state hint). */
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
