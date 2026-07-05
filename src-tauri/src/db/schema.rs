use rusqlite::Connection;

/// 全新 Lumen 数据库的所有 CREATE TABLE 语句。
pub const SCHEMA_SQL: &str = r#"
-- 核心记忆表
CREATE TABLE IF NOT EXISTS memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  content     TEXT NOT NULL,
  summary     TEXT,
  source      TEXT NOT NULL DEFAULT 'manual',   -- 'chat' | 'manual'
  importance  INTEGER NOT NULL DEFAULT 5,        -- 1..=10
  tags        TEXT NOT NULL DEFAULT '[]',         -- 字符串 JSON 数组
  created_at  INTEGER NOT NULL,                   -- Unix 毫秒
  updated_at  INTEGER NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0,
  -- 5 层分类：personal/technical/preference/session/page
  -- 默认 preference（中性层，避免旧数据归到 personal 被误保护）
  layer       TEXT NOT NULL DEFAULT 'preference',
  -- 仅 session 层使用：关联到具体会话
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  -- 仅 page 层使用：话题/领域标签，如 "React 项目"
  topic       TEXT
);
CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer, archived);

-- 每条记忆一行，以小端 f32 字节形式存储其嵌入向量。
CREATE TABLE IF NOT EXISTS embeddings (
  memory_id   INTEGER PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  vector      BLOB NOT NULL,
  dim         INTEGER NOT NULL,
  model       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- 对话与消息
CREATE TABLE IF NOT EXISTS conversations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,                  -- 'system' | 'user' | 'assistant'
  content         TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(conversation_id, created_at);

-- 设置（键值对）。v1 中密钥存放在此处；后续考虑使用 keyring。
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

/// 将 schema 应用到新连接或已有连接。幂等。
pub fn apply_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    conn.execute_batch(SCHEMA_SQL)?;
    Ok(())
}
