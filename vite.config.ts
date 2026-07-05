import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri 会启动开发服务器并与其通信；这些 host/port 设置
// 让 Vite 与 Tauri 的期望保持一致。
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    host: host || false,
    port: 1420,
    strictPort: true,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      // Rust 侧变更时不触发重建。
      ignored: ["**/src-tauri/**"],
    },
  },
});
