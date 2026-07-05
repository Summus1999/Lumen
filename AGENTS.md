# AGENTS.md — Lumen 项目开发规则

> ⚠️ 任何 AI 助手在动手修改本项目之前，必须完整阅读本文档。
> 本文件是项目的"宪法"，规定了架构约定、命名规则、踩坑记录、工程准则和开发流程。
> 违反这些规则会导致隐蔽的 bug（见下方"血泪教训"）。

---

## 0. 强制阅读声明

如果你是 AI 助手（Cursor / Claude / GPT / Copilot / ZCode 等），在执行任何写操作（编辑文件、生成代码、重构、添加依赖）之前：

1. 完整读完本文件，不要跳读。
2. 确认你理解了"架构概览"（§3）和"铁律"（§5）两节。
3. 特别重点读"工程准则"（§9）——这是基于 Karpathy LLM 编码原则的行为约束，规定了先想后写、简洁至上、外科手术式改动、目标驱动执行四条准则。
4. 特别注意"血泪教训"（§7）——那些是真实踩过的坑，重复踩会被骂。
5. 如果你不确定某个改动是否符合规则，先问用户，不要猜（§9.1）。

---

## 1. 项目是什么

Lumen 是一个本地优先的 Windows 记忆大脑：

- 用户与 AI（GLM）聊天
- 对话中的持久事实被自动抽取为"记忆"，向量化存储
- 后续对话通过 RAG 检索相关记忆注入上下文，AI 真正"记得"用户的事
- 用户可在记忆后台任意编辑/删除/归档记忆
- （规划中）悬浮球助手常驻桌面 + 定时推送相关 RSS 摘要

核心理念：所有数据只存在本机，唯一的网络出站是 GLM API 和（未来的）RSS 源。用户对自己的记忆有完全控制权。

---

## 2. 技术栈

| 层 | 选型 | 备注 |
| --- | --- | --- |
| 桌面框架 | Tauri 2 | Rust 后端 + WebView 前端，不用 Electron |
| 前端 | React 19 + Vite + TypeScript + Tailwind 4 | 状态管理用 Zustand |
| LLM | GLM `glm-4-flash`（对话）+ `embedding-3`（向量化） | base URL `https://open.bigmodel.cn/api/paas/v4` |
| 存储 | SQLite 单文件 `lumen.db` | 向量用 brute-force cosine 在 Rust 里算，不引入向量数据库 |
| HTTP | reqwest + rustls-tls | 不用 OpenSSL，方便 Windows 分发 |
| SQLite | rusqlite（bundled feature） | 自带 SQLite 引擎，无需系统安装 |

不要替换技术栈，除非用户明确要求。如果觉得某处该换，先提建议，别擅自改。

---

## 3. 架构概览

```
┌──────────────────────────────────────────────────────┐
│  前端 (src/)  React + TypeScript                      │
│  ChatView / MemoriesView / SettingsView               │
│  通过 invoke() 调用 Rust 命令，不直接碰 DB 或网络     │
└───────────────┬──────────────────────────────────────┘
                │  Tauri IPC (invoke / event)
┌───────────────▼──────────────────────────────────────┐
│  Rust 后端 (src-tauri/src/)                           │
│  commands.rs  ← 唯一暴露给前端的入口层                │
│  llm/         GLM client（chat + embeddings）         │
│  memory/      store（CRUD）/ rag（检索）/ extractor   │
│  db/          SQLite schema + r2d2 连接池             │
│  settings.rs  key-value 设置读写                      │
└───────────────┬──────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────┐
│  SQLite (lumen.db)  单文件，位于 %APPDATA%            │
│  memories / embeddings / conversations / messages     │
│  settings                                             │
└──────────────────────────────────────────────────────┘
```

### 分层铁律

- 前端不直接访问 SQLite 或发起 HTTP 请求。所有数据操作必须经 `commands.rs` 暴露的 `#[tauri::command]`。
- `commands.rs` 是唯一的 IPC 边界。新增命令都在这里注册（`lib.rs` 的 `invoke_handler!` 列表也要同步加）。
- Rust 内部模块互相调用可以，但不要跨过 commands 直接暴露内部函数给前端。

---

## 4. 目录结构

```
Lumen/
├── AGENTS.md                ← 你正在读的文件
├── src-tauri/               # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json      # 窗口配置、bundle 配置
│   ├── capabilities/        # Tauri 2 权限声明
│   └── src/
│       ├── main.rs          # 入口（仅调用 lib::run）
│       ├── lib.rs           # Tauri Builder + DB 初始化 + 命令注册
│       ├── commands.rs      # 【IPC 边界】所有 #[tauri::command]
│       ├── settings.rs      # AppSettings 读写
│       ├── db/
│       │   ├── schema.rs    # CREATE TABLE 语句
│       │   └── connection.rs# r2d2 连接池
│       ├── llm/
│       │   ├── glm_client.rs# GLM HTTP client
│       │   └── types.rs     # GLM API 请求/响应结构体
│       └── memory/
│           ├── store.rs     # 记忆 CRUD + embedding 存取
│           ├── rag.rs       # 检索（embed query → cosine top-k）
│           └── extractor.rs # LLM 抽取对话中的事实
├── src/                     # React 前端
│   ├── App.tsx              # 路由 + 侧边栏
│   ├── components/
│   │   ├── chat/            # ChatView
│   │   ├── memory/          # MemoriesView
│   │   └── settings/        # SettingsView
│   ├── lib/
│   │   ├── ipc.ts           # invoke() 的类型化封装（前端唯一的 IPC 入口）
│   │   └── store.ts         # Zustand UI 状态
│   ├── types.ts             # 与 Rust 对齐的共享 TS 类型
│   └── styles/globals.css   # Tailwind + 主题变量
├── package.json
└── vite.config.ts
```

---

## 5. 铁律（不可违反）

### 5.1 Rust ↔ 前端序列化：camelCase

这是最重要的规则，违反它会导致静默数据丢失。

所有跨越 Tauri IPC 边界的 Rust 结构体（即被 `commands.rs` 用作参数或返回值的 struct），必须加：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]   // ← 这一行不能少
pub struct XxxYyy {
    pub some_field: String,   // Rust 用 snake_case
                               // 序列化后前端收到 someField（camelCase）
}
```

原因：Rust 默认用 `snake_case`，前端 TypeScript 用 `camelCase`。如果漏加 `rename_all`，字段名对不上，serde 反序列化时找不到对应字段 → 静默填默认值（空字符串/0/null），不报错。这正是 API Key 保存后变空、聊天页卡死的根因。

例外：`llm/types.rs` 里的结构体是 GLM API 的请求/响应体，字段名由 GLM 规定（如 `max_tokens`），不要加 camelCase，保持原样。这些结构体不跨 IPC 边界。

### 5.2 新增 Tauri 命令的两步

1. 在 `commands.rs` 写 `#[tauri::command] pub fn xxx(...)`
2. 在 `lib.rs` 的 `generate_handler![...]` 列表里注册

漏掉第 2 步会导致前端 invoke 报"command not found"。

### 5.3 前端 IPC 只走 ipc.ts

前端组件不要直接 `import { invoke } from "@tauri-apps/api/core"` 然后手写命令名。所有 IPC 调用必须封装在 `src/lib/ipc.ts` 里，组件只 import 那里的类型化函数。

这样保证命令名和参数类型有单一来源，改 Rust 端时能一处定位。

### 5.4 时间戳统一 unix 毫秒

所有时间字段（`created_at`、`updated_at` 等）统一用 i64 unix 毫秒（`chrono::Utc::now().timestamp_millis()`）。前端 TS 类型对应 `number`。不要用秒、不要用 ISO 字符串、不要用 DateTime 对象。

### 5.5 embedding 存储格式

向量存在 `embeddings.vector` 列，格式是 little-endian f32 字节流。读取时按 4 字节一组 `f32::from_le_bytes` 解码。不要改这个格式，否则 cosine 计算会错。

### 5.6 数据库 schema 改动

`db/schema.rs` 的 `SCHEMA_SQL` 用 `CREATE TABLE IF NOT EXISTS`，是幂等的。不要写 DROP TABLE 或破坏性迁移——用户的记忆在里面。需要改 schema 时，加 `ALTER TABLE` 或新表，保留旧数据。

---

## 6. 代码风格（强制）

### 6.1 每个函数都要有注释，写清楚"为什么"

每个函数（Rust 的 `fn`、TypeScript 的 `function`/箭头函数）上方必须有简洁注释，说明这个函数存在的目的——不是复述它做什么（代码本身已经说明了"做什么"），而是解释"为什么要写它"。

好的注释（解释意图）：
```rust
/// 对话后自动抽取持久事实。每轮聊天结束后调用一次，
/// 让 Lumen 能"记住"用户的兴趣、计划、偏好等长期信息。
pub async fn extract_and_store(...) { ... }
```

差的注释（复述代码，等于没写）：
```rust
/// 抽取并存储
pub async fn extract_and_store(...) { ... }
```

 trivial 的函数（getter、一行 return）可以不写，但任何含业务逻辑的函数都必须写。

### 6.2 代码简洁、可维护

- 优先可读性，不炫技。一个清晰的三行 if-else 胜过一个过度抽象的 trait 链。
- 函数做一件事。如果一个函数同时"查询数据库 + 调 LLM + 写文件"，拆成三个。
- 命名要自解释。`retrieve_relevant_memories` 好，`get_data` 差。
- 不要留 TODO/FIXME 不清理。要么现在做，要么开 issue 记录，不要把烂尾埋在代码里。
- 这条与 §9.2 简洁至上呼应：写完回头看看，能不能删掉一半。

### 6.3 修 bug 必须在关键代码处注释根因

每次修复 bug，在改动的那行/那段代码旁加注释，写清楚"为什么这么改"。不是为了解释代码本身，而是为了让后来的人（包括未来的你、以及其他 AI）知道这个改动是在修什么 bug，不要无意中改回去。

示例（来自真实修复）：
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]  // ← 修复：不加 camelCase 会导致 API Key 静默变空
pub struct AppSettings {            //    根因见 AGENTS.md §7 教训 1
    pub api_key: String,
    ...
}
```

注释要包含：改了什么、为什么（根因）、可选地指向 AGENTS.md 的教训编号。一句话即可，不要写长篇。

### 6.4 注释统一中文，专有名词保留原文

所有代码注释、commit message、UI 文案用中文。但以下情况保留英文原词，不强行翻译：

- 技术专有名词：API Key、token、embedding、RAG、cosine、cron、RSS、WebSocket
- 库/框架名：Tauri、React、SQLite、reqwest、rusqlite、serde
- 标准缩写：HTTP、URL、JSON、SQL、IPC、UI

判断标准：这个词中文翻译后会不会让人困惑？会的话就保留英文。例如"向量"可以翻，但"embedding"翻成"嵌入"反而不清楚，保留原文。

### 6.5 Markdown 文档不用加粗符号

写任何 Markdown 文档（AGENTS.md、README.md、commit body、代码注释里的 markdown）时，不要用 `加粗` 语法。需要强调的地方，用以下替代：

- 换行单独成句
- 用列表结构突出
- 用 `代码格式` 标注关键术语
- 必要时用标题分层

为什么：加粗在终端、部分 markdown 渲染器里效果不一致，且过度加粗会削弱重点。统一的平实排版更耐读。

本规则同样适用于本文件——如果你发现本文件里还有加粗残留，清理掉。

---

## 7. 血泪教训（真实踩坑记录）

### 教训 1：serde camelCase 缺失 → API Key 静默变空

现象：设置页填了 GLM API Key，点保存显示"已保存"，但回聊天页还是显示"前往设置"欢迎页，`hasApiKey` 永远是 false。

根因：`AppSettings` 结构体没加 `#[serde(rename_all = "camelCase")]`。前端传 `{apiKey: "xxx"}`，Rust 反序列化时找 `api_key` 字段找不到 → 填默认空字符串。受影响的还有 `Conversation`、`StoredMessage`、`Memory` 的时间戳字段。

修复：给所有跨 IPC 的 struct 加 `#[serde(rename_all = "camelCase")]`。

教训：新增任何跨 IPC 的 struct，第一件事就是加 camelCase，不要事后补。写完 struct 后立刻 grep 检查。

### 教训 2：后台 dev server 用 shell `&` 会被连坐杀掉

现象：用 `npm run tauri dev > log 2>&1 &` 启动，窗口闪现一下就消失，日志停在 `Running lumen.exe`。

根因：shell 后台 `&` 启动的进程，父 shell 退出时整个进程树被杀。

正确做法：用 harness 的 `run_in_background: true` 托管，不要用 shell `&`。

### 教训 3：r2d2 CustomConnection 需要实现 Debug

`r2d2::CustomizeConnection` 的实现体要加 `#[derive(Debug)]`，否则编译报 `doesn't implement Debug`。

---

## 8. 开发流程

### 启动开发

```bash
npm install          # 首次
npm run tauri dev    # 启动，前端热重载，Rust 改动自动重编译
```

### 验证清单（改完代码后必跑）

```bash
# Rust 端
cd src-tauri && cargo check       # 编译检查，0 warning
cd src-tauri && cargo test        # 单测（extractor JSON 解析等）
cd src-tauri && cargo build       # 完整链接

# 前端
npx tsc -b                        # 类型检查
npm run build                     # vite 构建
```

四项全绿才能提交。 不要提交编译不过或类型报错的代码。

### 数据库位置

开发时：`%APPDATA%/com.summus.lumen/lumen.db`

想清空重来：删掉这个文件，应用下次启动会重建。

### 提交规范

- 用 conventional commit：`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`
- 中文描述即可，但修复 bug 时要在 commit body 里写清根因
- 不要提交 `node_modules/`、`dist/`、`src-tauri/target/`、`*.db`、`*.tsbuildinfo`（.gitignore 已排除）

---

## 9. 工程准则（参考 Karpathy 的 LLM 编码原则）

> 以下四条准则源自 Andrej Karpathy 对 LLM 编码陷阱的观察，偏保守、重验证。
> 琐碎任务可凭判断酌情处理，但涉及核心逻辑（RAG、记忆抽取、IPC 边界）时必须严格遵守。

### 8.1 先想后写（Think Before Coding）

不要假设，不要藏起困惑，主动暴露权衡。

动手实现之前：

- 显式说出你的假设。 不确定就问，不要猜了再写。例如用户说"加个搜索功能"，你要确认：搜记忆内容还是也搜摘要/标签？实时搜还是按键触发？不要默默选一个。
- 如果存在多种合理解读，全部列出来，让用户选，不要默默挑一个。例："这里我可以 (a) 在 Rust 端做 LIKE 查询，或 (b) 前端内存过滤。数据量上千后 (a) 更稳，你要哪个？"
- 如果有更简单的做法，说出来，必要时反驳用户。 用户要求不等于最优解。例："你说要加全文搜索引擎，但记忆量才几百条，SQLite LIKE 就够了，引入 Meilisearch 是过度设计。"
- 看不懂就停下。 命名困惑点，然后问。不要在半懂不懂的状态下写代码。例："我不确定 `ScoredMemory` 为什么要按重要度加权而不直接按相似度——是怕低重要度的高相似噪声吗？"

Lumen 特化：涉及 IPC 边界（commands.rs）、RAG 检索逻辑（rag.rs）、记忆抽取 prompt（extractor.rs）的改动，必须先说明意图再动手。

### 8.2 简洁至上（Simplicity First）

用解决问题的最少代码，不写任何投机性的东西。

- 不做用户没要求的功能。"顺手加个导出按钮"——不要。
- 不为只用一次的代码做抽象。一个 struct 只在一处用，不需要 trait。
- 不加没被要求的"灵活性"或"可配置性"。设置项只有用户明确要的才加。
- 不为不可能发生的场景写错误处理。Rust 的 `unwrap()` 在"DB schema 保证非空"的场景下是合理的，不必处处 `?` + 自定义错误。
- 写完 200 行后发现 50 行能搞定，重写。 问自己："资深工程师会不会觉得这过度复杂？"会的话就简化。

Lumen 特化检查：
- 新加的 Tauri 命令，前端是否真的会调用？不会调用就不写。
- 新加的 npm 包/crate，能否用现有依赖或标准库替代？能就不加。
- 新加的 Rust struct，是否真的跨 IPC？不跨就别加 `Serialize`。
- 新加的 React 状态，是否真的需要 Zustand？局部状态够用就别上全局 store。

### 8.3 外科手术式改动（Surgical Changes）

只动必须动的，只清理自己造成的混乱。

编辑现有代码时：

- 不要"顺手改进"相邻的代码、注释、格式。 看到旁边有个变量命名不顺眼，忍住。看到注释写错了，提一句，不要自己改。
- 不重构没坏的东西。 一个函数写得丑但能跑、有测试覆盖，不要因为"看着难受"就重构。
- 匹配现有风格，哪怕你觉得有更好的写法。 Lumen 的 Rust 用中文注释、4 空格缩进、`?` 传错误；前端用函数组件 + Hooks、Tailwind 类名写法。跟着来，不要引入新风格。
- 注意到无关的死代码，提一句，不要删。 例："顺带一提，`commands.rs` 第 X 行有个未使用的 import，要我一起清掉吗？"

当你的改动产生孤儿时：
- 删掉你的改动导致不再使用的 import / 变量 / 函数。
- 不删之前就存在的死代码，除非用户要求。

检验标准：每一行改动都能直接追溯到用户的需求。 追溯不上的改动就是越界。

### 8.4 目标驱动执行（Goal-Driven Execution）

定义成功标准，循环到验证通过。

把任务转成可验证的目标：

| 模糊任务 | 可验证目标 |
| --- | --- |
| "加个搜索" | "在 MemoriesView 输入框打字，记忆列表实时过滤，验证：输入 'AI' 只显示含 AI 的记忆" |
| "修这个 bug" | "写一个能复现 bug 的步骤，修复后按该步骤验证不再复现" |
| "重构 RAG" | "重构前 `cargo test` 通过，重构后 `cargo test` 仍通过，且聊天时记忆仍被正确注入" |

多步任务先列简短计划，每步带验证：

```
1. 加 SQLite 查询函数 → 验证：cargo check 通过
2. 暴露为 Tauri 命令 → 验证：前端能 invoke 拿到数据
3. 接到 UI → 验证：实际操作能看到搜索结果
```

强成功标准让你能独立循环到完成，弱标准（"弄好它"）会不断要用户确认。 优先用强标准。

Lumen 特化：完成任何改动后，必须跑第 8 节的验证清单（cargo check/test/build + tsc + vite build），四项全绿才算"完成"。只是"我觉得改对了"不算完成。

---

## 10. 设计决策与理由（为什么这么做）

### 为什么用 SQLite + 暴力余弦，不用向量数据库？

个人记忆量级在几十到几千条，暴力计算 f32 点积在 Rust 里微秒级完成。零额外依赖，备份就是复制一个 `.db` 文件。等到记忆上万再换 LanceDB 也不迟。不要过早优化。

### 为什么对话后自动抽取记忆，不手动标？

用户需求是"平时聊天就能形成记忆"——抽取必须自动化。但抽取出的记忆完全可编辑/可删除，保证用户对记忆有最终控制权。

### RAG 的相似度阈值与重要度加权

- 相似度 `< 0.2` 的记忆不注入（避免噪声）
- 最终分数 = `cosine × (0.5 + importance/20)`
- 重要度 10 → 1.0 倍权重；重要度 1 → 0.55 倍
- 长期重要的事更容易被想起

### 为什么默认 glm-4-flash 而非 glm-4-plus？

日常对话 flash 够用且便宜。设置里可切 plus。embedding 只有一种（embedding-3），没得选。

---

## 11. 当前进度与后续阶段

- Phase 1+2（已完成）：GLM 聊天 + 记忆自动抽取 + RAG 检索 + 记忆后台管理
- Phase 3（未开始）：悬浮球窗口 + 系统托盘 + 开机自启
- Phase 4（未开始）：RSS 订阅管理 + cron 调度 + GLM 摘要 + Windows 通知推送
- Phase 5（未开始）：备份导入导出 + keyring 存密钥 + 会话历史侧栏 + 深色模式

做后续阶段时，先读对应模块的现有代码，复用现有模式，不要另起炉灶。

---

## 12. AI 助手行为准则

1. 改代码前先读现有代码，匹配现有的注释密度、命名风格、错误处理方式。Lumen 的 Rust 代码用中文注释，前端也是中文 UI 文案，保持一致。（对应 §9.3 外科手术式改动）
2. 不要引入新依赖，除非确实必要且用户同意。每加一个 crate / npm 包都要能说出理由。（对应 §9.2 简洁至上）
3. 不要删除 .gitignore 里的条目，尤其是 `*.db` 和 `target/`。
4. 改完一定要跑验证清单（第 8 节），四项全绿才算完成。只是"我觉得改对了"不算完成。（对应 §9.4 目标驱动执行）
5. 遇到不确定的设计决策，问用户，不要自作主张。 不要假设、不要藏起困惑、不要默默挑一种解读。（对应 §9.1 先想后写）
6. 每一行改动都要能追溯到用户需求。 追溯不上的改动（顺手重构、顺手优化、顺手改格式）就是越界。（对应 §9.3 外科手术式改动）
7. 本文档是活的——踩了新坑、立了新规矩，要及时追加到第 7 节"血泪教训"或第 5 节"铁律"。

---

*最后更新：Phase 1+2 完成后，融入 Karpathy LLM 编码准则。维护者：Summus。*
