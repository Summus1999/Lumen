# Lumen UI 重构设计简报

> 本文件是 `design-brief-lumen-ui.json` 的人类可读摘要。
> 所有 token 定义以 JSON 为准，本文档用于评审与沟通。

## Purpose & Audience

Lumen 当前是功能闭环但视觉朴素的深色 MVP。本次重构目标：建立完整 design token 体系（color/typography/spacing/radius/elevation/motion），统一三个视图（聊天/记忆/设置）与主侧边栏的视觉风格，从"开发者审美"升级为有自己设计语言、毛玻璃质感、渐变 accent 的精致消费级桌面应用。

目标用户：

- 个人知识工作者、重度 AI 对话用户
- 重视数据本地化与隐私的技术敏感用户
- 使用场景：Windows 桌面常驻应用，单用户本地使用，高频次长会话

为后续 Phase 3-5（悬浮球/托盘/RSS/通知）沉淀可复用的 token 与组件基础。

## Tone & Brand Voice

专业、克制、可信、有科技温度。深色基调传达专注与沉浸，毛玻璃与渐变带来精致感而非浮夸。不卖萌、不喧宾夺主，让内容（对话/记忆）成为视觉主角。

关键词：克制、可信、专注、有温度的科技感、本地优先

Do:

- 用平实中文，技术专有名词保留英文（API Key、embedding、RAG 等）
- 强调本地存储与用户控制权
- 状态反馈用最小必要的视觉信号（loading 圆点、Check 图标）
- 引导文案聚焦用户行为而非产品功能

Don't:

- 使用感叹号、卖萌语气词（呢、啦、哦）
- 在 UI 上堆砌品牌口号或营销话术
- 用红色表达非错误状态
- 过度动画干扰阅读

## Design Variables (Tokens) Summary

### Color

#### 语义色（核心扩展点）

| Token | 值 | 用途 |
| --- | --- | --- |
| bg/default | #0f1115 | 应用背景 |
| bg/elevated | #161a21 | 面板/卡片 |
| bg/sunken | #0c0e12 | 输入框/代码块内嵌 |
| panel/glass | rgba(22,26,33,0.72) | 毛玻璃面板 |
| border/subtle | #1f2530 | 弱分隔 |
| border/default | #232932 | 标准边框 |
| border/strong | #2c333d | 强调边框 |
| text/primary | #e6e8ec | 主文本 |
| text/secondary | #8b93a1 | 次要文本 |
| text/tertiary | #5c6470 | 占位/时间戳 |
| accent/default | #6aa0ff | 强调主色 |
| accent/gradient | linear-gradient(135deg,#6aa0ff,#8b7ff5) | 主 CTA、激活态 |
| success/default | #4ade80 | 成功 |
| warning/default | #fbbf24 | 警告/归档 |
| danger/default | #f87171 | 危险/错误 |
| info/default | #60a5fa | 信息/来源徽章 |

语义色全部带 subtle 变体（12% 透明背景）用于 Badge。

#### 中性灰阶（替换散落硬编码）

`neutral-50` 到 `neutral-975` 共 12 档，覆盖从 #f5f6f8 到 #0c0e12。当前散落的 #1f2530 / #191e26 / #0c0e12 / #1d222b 全部映射到对应档位，消除"6-7 种相近深灰"的层次模糊。

#### Accent 色阶

`accent-50` 到 `accent-900` 共 10 档，用于 hover/active 状态梯度。

### Typography

- 正文字体：Inter（通过 Google Fonts 引入），中文回落 PingFang SC / Microsoft YaHei
- 代码字体：JetBrains Mono（通过 Google Fonts 引入）
- 字号：xs(12) / sm(13) / md(14) / lg(16) / xl(18) / 2xl(22) / 3xl(28)
- 字重：regular(400) / medium(500) / semibold(600) / bold(700)
- 行高：tight(1.25) / base(1.5) / relaxed(1.6)

当前问题：字体声明了但未引入文件，实际回落 Segoe UI。本次通过 index.html 加 Google Fonts 修复。

### Spacing

沿用 Tailwind 原生间距（0/0.5/1/2/3/4/5/6/8/10/12/16），不另立尺度，保持工具类一致性。

### Radius

从当前 5 种混用收敛到 4 档：

| Token | 值 | 用途 |
| --- | --- | --- |
| sm | 6px | 小按钮、徽章 |
| md | 10px | 输入框、按钮、NavItem |
| lg | 16px | 卡片、消息气泡、Modal |
| xl | 20px | 大面板（少用） |
| full | 9999 | 头像、圆形按钮、Badge |

### Elevation

| Token | 值 | 用途 |
| --- | --- | --- |
| e1_subtle | 0 1px 2px rgba(0,0,0,0.24) | 卡片默认 |
| e2_floating | 0 4px 12px rgba(0,0,0,0.32) | 卡片 hover、浮层 |
| e3_overlay | 0 12px 32px rgba(0,0,0,0.48) | Modal |
| e_accent_glow | 0 0 0 1px accent + 0 4px 16px accent | 激活态、主 CTA |

### Motion

- 时长：instant(80) / fast(140) / base(220) / slow(360) / slowest(480) ms
- 缓动：standard / decelerate / accelerate / spring
- 模式：fade_in / scale_in（Modal 进场）/ slide_up / hover_lift / color_shift

### Blur

- glass：blur(12px) saturate(140%)，毛玻璃面板统一用这档

## Component Library Mapping & Variant Table

| 组件 | 主要变体 | 关键 token |
| --- | --- | --- |
| Button | emphasis(primary/secondary/ghost/danger) × size(sm/md/lg) | primary 用 accent/gradient + e_accent_glow |
| Card | surface(flat/elevated/glass) × padding | glass 用 panel/glass + blur.glass |
| Input | size(sm/md) × state | focus 用 accent border + e_accent_glow |
| Textarea | — | 同 Input |
| Select | size(sm/md) | appearance:none + 自定义 ChevronDown |
| Badge | tone(neutral/info/success/warning/danger/accent) | 全用 subtle 背景 + 对应色文字 |
| Modal | size(sm/md/lg) | overlay glass + panel scale_in 动画 |
| Sidebar | width=64px | panel/glass + blur.glass |
| NavItem | state(default/hover/active) | active 用 accent/gradient + e_accent_glow |
| MessageBubble | role(user/assistant/error) | user 用渐变，assistant 用毛玻璃 |
| MemoryCard | state(default/hover/archived) | hover 切 glass 背景 + 上浮 |
| EmptyState | — | 图标渐变填充 + 标题 + 副标题 + CTA |
| FilterBar | — | search input + select + checkbox |

## Patterns & Flows

1. Two-column App Shell：左侧 Sidebar(64px) + 右侧 main(flex-1)
2. Chat Three-region：对话列表(192px) + 消息区(flex-1) + 输入区(fixed bottom)
3. Memory List：header + filterbar + scrollable card list
4. Settings Form Sections：max-w-2xl 居中，分组到 Card，每组带标题 + 图标
5. Modal Dialog：fixed inset-0 flex center，overlay + panel(scale_in 动画)

## Channel-Specific Guidelines

当前唯一渠道是 Tauri 2 Windows 主窗口（WebView2，支持 backdrop-filter），所有组件优先为此渠道设计。

未来渠道（Phase 3-5）：

- 系统托盘菜单：复用 color token，无需独立组件
- 悬浮球小窗口：复用 MessageBubble + Input 精简版
- Windows 通知：复用 semantic color（success/info/warning）

## Accessibility & Internationalization

- 对比度：WCAG 2.2 AA
  - text.primary(#e6e8ec) on bg.default(#0f1115) ≈ 14:1，远超 AA 4.5:1
  - text.secondary(#8b93a1) on bg.default ≈ 5.2:1，达标
  - accent.default(#6aa0ff) on bg.default ≈ 6.8:1，达标
- 最小触控热区：44px（NavItem 40×40 临界，主要交互按钮 ≥ 44px）
- 键盘可达 + focus 可见
- 本地化：zh-CN，无 RTL 需求
- 屏幕阅读器：语义化 HTML + aria-label

## Naming Conventions & File Structure

- 组件：PascalCase（ChatView.tsx）
- 变体：kebab-case（emphasis=primary）
- Token：dot.case（color.semantic.accent.default）
- CSS 变量：kebab-case（--lumen-accent, --color-accent-default）
- Tailwind theme：kebab-case（bg-panel, text-muted, rounded-lg）
- 文档：kebab-case（design-brief-lumen-ui.md）

文件结构：

- tokens：src/styles/globals.css（:root + @theme）
- 组件：src/components/{chat,memory,settings}/
- 通用组件：src/components/ui/（Button/Modal/Tooltip 等按需新建）
- 设计文档：initiatives/lumen-ui-redesign/design/

## Success Metrics & Experiment Plan

主要指标：视觉一致性——硬编码色值数量降为 0（全走 token）

次要指标：

- 圆角种类从 5 种收敛到 4 档
- 字体实际加载 Inter 而非回落 Segoe UI
- 三个视图视觉风格统一（同一套 token + 组件）
- WCAG AA 对比度全量达标

成功标准：globals.css 的 :root 变量覆盖所有色值；组件中无硬编码 hex；tsc + vite build 通过；实际运行视觉无割裂感。

## Asset Guidelines

- 图标：lucide-react 现有图标，不引入新图标库
- 字体：Inter + JetBrains Mono，通过 Google Fonts CDN 引入
- 插画：无插画，用图标 + 渐变填充替代
- 图标渐变填充：用 SVG gradient + accent/gradient 实现

---

最后更新：2026-07-05，Phase 1+2 完成后的 UI 重构准备阶段。维护者：Summus。
