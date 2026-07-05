import { useState, type ReactNode } from "react";

/**
 * 自定义 Tooltip：替代原生 title 属性。
 * 原生 title 在 Windows 上样式不可控、延迟不可调，且与深色主题不协调。
 * 这里用 hover 延迟显示 + 毛玻璃背景，匹配 Lumen 设计语言。
 */
export default function Tooltip({
  label,
  children,
  side = "right",
}: {
  label: string;
  children: ReactNode;
  side?: "right" | "left" | "top" | "bottom";
}) {
  const [visible, setVisible] = useState(false);

  // 延迟显示，避免鼠标快速划过时闪烁
  const show = () => setVisible(true);
  const hide = () => setVisible(false);

  const positionClass =
    side === "right"
      ? "left-full ml-2 top-1/2 -translate-y-1/2"
      : side === "left"
        ? "right-full mr-2 top-1/2 -translate-y-1/2"
        : side === "top"
          ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
          : "top-full mt-2 left-1/2 -translate-x-1/2";

  return (
    <div className="relative flex" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div
          className={`glass-panel pointer-events-none absolute z-50 whitespace-nowrap rounded-md px-2 py-1 text-xs text-text-primary shadow-e2 animate-fade-in ${positionClass}`}
        >
          {label}
        </div>
      )}
    </div>
  );
}
