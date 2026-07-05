use rusqlite::Connection;

/// All CREATE TABLE statements for a fresh Lumen database.
pub const SCHEMA_SQL: &str = r#"
-- Core memory store
CREATE TABLE IF NOT EXISTS memories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  content     TEXT NOT NULL,
  summary     TEXT,
  source      TEXT NOT NULL DEFAULT 'manual',   -- 'chat' | 'manual'
  importance  INTEGER NOT NULL DEFAULT 5,        -- 1..=10
  tags        TEXT NOT NULL DEFAULT '[]',         -- JSON array of strings
  created_at  INTEGER NOT NULL,                   -- unix ms
  updated_at  INTEGER NOT NULL,
  archived    INTEGER NOT NULL DEFAULT 0
);

-- One row per memory, holding its embedding as little-endian f32 bytes.
CREATE TABLE IF NOT EXISTS embeddings (
  memory_id   INTEGER PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  vector      BLOB NOT NULL,
  dim         INTEGER NOT NULL,
  model       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- Conversations & messages
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

-- Settings (key-value). Secrets live here for v1; keyring later.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

/// Apply the schema to a fresh or existing connection. Idempotent.
pub fn apply_schema(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    conn.execute_batch(SCHEMA_SQL)?;
    Ok(())
}
