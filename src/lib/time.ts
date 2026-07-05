/**
 * 时间格式化工具：统一 ChatView 和 MemoriesView 的时间显示。
 * 所有时间字段在 types.ts 里都是 unix 毫秒（i64），对应 TS 的 number。
 */

/** 把 unix 毫秒格式化为 HH:mm，用于聊天消息时间戳。 */
export function formatTime(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** 把 unix 毫秒格式化为相对时间（如 "3 天前"），用于记忆卡片。 */
export function formatRelative(ms: number): string {
  const now = Date.now();
  const diff = now - ms;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;

  // 超过一周回退到日期
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** 把 unix 毫秒归类到对话侧边栏的时间分组标签。 */
export function conversationGroup(ms: number): "今天" | "昨天" | "更早" {
  const d = new Date(ms);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (target.getTime() === today.getTime()) return "今天";
  if (target.getTime() === yesterday.getTime()) return "昨天";
  return "更早";
}
