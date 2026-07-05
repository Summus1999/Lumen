import type { ReactNode } from "react";

/**
 * 通用语义色徽章：统一来源/重要度/标签/归档等徽章的视觉风格。
 * 替代之前各处散落的 bg-[#1f2530] / bg-accent/15 / bg-yellow-900/40 等硬编码写法。
 *
 * tone 对应 design-brief 里的语义色体系：
 * - neutral: 中性灰，标签用
 * - info: 蓝色，来源信息用
 * - accent: 渐变紫蓝，重要度用
 * - success/warning/danger: 对应语义
 */
const TONE_STYLES: Record<string, string> = {
  neutral: "bg-glass-highlight text-text-secondary",
  info: "bg-info-subtle text-info",
  accent: "bg-accent-gradient-subtle text-accent",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
};

export default function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "info" | "accent" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TONE_STYLES[tone]}`}
    >
      {children}
    </span>
  );
}
