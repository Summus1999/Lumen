# Lumen

> 一个本地优先的 Windows 记忆大脑：和 AI 聊天，自动沉淀可编辑的记忆，按需在固定时间推送相关 RSS 摘要。计划中的悬浮球助手常驻桌面。

## 当前阶段（Phase 1 + 2）

已实现核心闭环：

- **对话**：与 GLM（智谱）聊天，流式渲染 Markdown 回复，左侧会话历史。
- **记忆自动沉淀**：每一轮对话后，后台用 LLM 从中抽取「关于用户的持久事实」，带重要度 1–10 与标签，自动向量化入库。
- **RAG 检索**：每次用户发消息时，先用 `embedding-3` 向量化该消息，对全量记忆做 cosine 相似度检索 top-5，按重要度加权后注入 system prompt——AI 真正「记得」关于你的事。
- **记忆后台**：左侧导航进入「记忆管理」，可搜索、按来源/标签/重要度筛选、行内编辑内容/标签/重要度、归档、硬删除，也可手动添加记忆。删除的记忆 AI 不再提及。

后续阶段（未实现）：Phase 3 悬浮球 + 系统托盘；Phase 4 RSS 订阅 + cron 调度 + Windows 通知推送；Phase 5 备份导入导出、keyring 存密钥、深色模式。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面框架 | Tauri 2（Rust 后端 + WebView 前端） |
| 前端 | React 19 + Vite + TypeScript + Tailwind 4 + lucide-react |
| LLM | GLM `glm-4-flash`（对话）+ `embedding-3`（向量化），base `https://open.bigmodel.cn/api/paas/v4` |
| 存储 | 单个 SQLite 文件 `lumen.db`，向量用 brute-force cosine 在 Rust 里算 |
| 状态 | Zustand |
| 默认模型 | glm-4-flash + embedding-3（设置里可改） |

所有数据（对话、记忆、设置、API Key）只存在本机 `%APPDATA%/com.summus.lumen/lumen.db`，唯一的网络出站是 GLM API。

## 目录结构

```
Lumen/
├── src-tauri/              # Rust 后端
│   └── src/
│       ├── main.rs         # 入口
│       ├── lib.rs          # Tauri Builder、DB 初始化、命令注册
│       ├── commands.rs     # 暴露给前端的 #[tauri::command]
│       ├── db/             # SQLite schema + r2d2 连接池
│       ├── llm/            # GLM client（chat / embeddings）+ 类型
│       ├── memory/         # store（CRUD）/ rag（检索）/ extractor（抽取）
│       └── settings.rs     # key-value 设置读写
├── src/                    # React 前端
│   ├── components/
│   │   ├── chat/           # ChatView：会话历史 + 消息流 + 输入框
│   │   ├── memory/         # MemoriesView：列表/筛选/编辑/删除/添加
│   │   └── settings/       # SettingsView：API Key、模型、base URL
│   ├── lib/                # ipc.ts（invoke 封装）+ store.ts（zustand）
│   ├── types.ts            # 与 Rust 对齐的共享类型
│   └── styles/globals.css  # Tailwind + 主题变量
├── package.json
└── vite.config.ts
```

## 开发环境准备

需要：

- [Node.js](https://nodejs.org/) ≥ 20（已验证 v25）
- [Rust](https://rustup.rs/) ≥ 1.77（已验证 1.92）
- Windows 上还需 WebView2（Win10/11 一般已自带）和 MSVC 构建工具（随 Visual Studio Build Tools 安装）

## 本地开发

```bash
# 1. 安装前端依赖
npm install

# 2. 以开发模式启动（同时起 vite 和 tauri 窗口）
npm run tauri dev
```

首次启动会编译大量 Rust 依赖（几分钟），之后增量编译很快。窗口打开后：

1. 进入「设置」（左侧齿轮图标），填入 GLM API Key（在 [open.bigmodel.cn](https://open.bigmodel.cn) 控制台获取），保存。
2. 回到「聊天」，随便聊几句关于自己的事（兴趣、正在做的项目、想买的东西）。
3. 进入「记忆」，你会看到对话刚产生的记忆（来源标「对话」），可编辑标签、调重要度、删除。
4. 再回聊天问相关问题，验证 AI 是否引用了这些记忆。

## 构建 Windows 安装包

```bash
npm run tauri build
```

产物在 `src-tauri/target/release/bundle/`：包含 `.msi` 安装包和 `.exe`（NSIS）。最终的可执行文件本体约 10MB 量级。

## 数据存哪

- 数据库：`%APPDATA%/com.summus.lumen/lumen.db`
- 想清空重来：删除该文件即可（应用会在下次启动时重建）。

## 验证清单（已通过）

- [x] `cargo check` 通过，0 warning
- [x] `cargo test` 通过（extractor JSON 解析 2 个单测）
- [x] `cargo build` 通过（链接成功）
- [x] `tsc -b` 类型检查通过
- [x] `vite build` 产出 `dist/`

## 设计要点

**为什么用 SQLite + 暴力余弦而不是向量数据库？** 个人记忆量级在几十到几千条之间，暴力计算 f32 点积在 Rust 里微秒级完成，零额外依赖，备份就是复制一个 `.db` 文件。等到记忆上万再换 LanceDB 也不迟。

**为什么对话后自动抽取而不是手动标记忆？** 你的需求是「平时聊天就能形成记忆」——所以抽取必须自动化。但抽取出的记忆完全可编辑/可删除，保证你对记忆有最终控制权。

**RAG 的相似度阈值与重要度加权**：相似度低于 0.2 的记忆不会被注入（避免噪声）；最终分数 = `cosine × (0.5 + importance/20)`，即重要度 10 的记忆拿到 1.0 倍权重，重要度 1 的记忆拿到 0.55 倍——长期重要的事更易被想起。

## License

MIT
