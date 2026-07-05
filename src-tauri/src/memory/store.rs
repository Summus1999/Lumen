use anyhow::Result;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::db::DbPool;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MemorySource {
    Chat,
    Manual,
}

impl MemorySource {
    pub fn as_str(&self) -> &'static str {
        match self {
            MemorySource::Chat => "chat",
            MemorySource::Manual => "manual",
        }
    }
    pub fn from_str(s: &str) -> Self {
        match s {
            "chat" => MemorySource::Chat,
            _ => MemorySource::Manual,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub id: i64,
    pub content: String,
    pub summary: Option<String>,
    pub source: MemorySource,
    pub importance: i32, // 1..=10
    pub tags: Vec<String>,
    pub created_at: i64, // unix ms
    pub updated_at: i64,
    pub archived: bool,
}

/// Input for creating or updating a memory. All optional fields fall back
/// to defaults / existing values on update.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInput {
    pub content: Option<String>,
    pub summary: Option<Option<String>>,
    pub source: Option<MemorySource>,
    pub importance: Option<i32>,
    pub tags: Option<Vec<String>>,
    pub archived: Option<bool>,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn row_to_memory(row: &rusqlite::Row) -> rusqlite::Result<Memory> {
    let source_str: String = row.get("source")?;
    let tags_json: String = row.get("tags")?;
    let archived_int: i32 = row.get("archived")?;
    let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
    Ok(Memory {
        id: row.get("id")?,
        content: row.get("content")?,
        summary: row.get("summary")?,
        source: MemorySource::from_str(&source_str),
        importance: row.get("importance")?,
        tags,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        archived: archived_int != 0,
    })
}

pub fn list_memories(pool: &DbPool) -> Result<Vec<Memory>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, content, summary, source, importance, tags, created_at, updated_at, archived
         FROM memories
         ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_memory)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

pub fn get_memory(pool: &DbPool, id: i64) -> Result<Option<Memory>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, content, summary, source, importance, tags, created_at, updated_at, archived
         FROM memories WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], row_to_memory)?;
    if let Some(r) = rows.next() {
        Ok(Some(r?))
    } else {
        Ok(None)
    }
}

/// Insert a memory and return it (without an embedding — caller calls
/// `rag::embed_and_store` afterwards).
pub fn add_memory(pool: &DbPool, input: &MemoryInput) -> Result<Memory> {
    let conn = pool.get()?;
    let now = now_ms();
    let content = input
        .content
        .clone()
        .unwrap_or_default()
        .trim()
        .to_string();
    if content.is_empty() {
        anyhow::bail!("memory content cannot be empty");
    }
    let source = input.source.unwrap_or(MemorySource::Manual);
    let importance = input.importance.unwrap_or(5).clamp(1, 10);
    let tags = input.tags.clone().unwrap_or_default();
    let tags_json = serde_json::to_string(&tags)?;
    let summary = input.summary.clone().flatten();

    conn.execute(
        "INSERT INTO memories (content, summary, source, importance, tags, created_at, updated_at, archived)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)",
        params![content, summary, source.as_str(), importance, tags_json, now, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(Memory {
        id,
        content,
        summary,
        source,
        importance,
        tags,
        created_at: now,
        updated_at: now,
        archived: false,
    })
}

/// Update selected fields of an existing memory. Only provided fields change.
pub fn update_memory(pool: &DbPool, id: i64, input: &MemoryInput) -> Result<Memory> {
    let existing = get_memory(pool, id)?
        .ok_or_else(|| anyhow::anyhow!("memory {} not found", id))?;

    let content = input.content.clone().unwrap_or(existing.content);
    let summary = match &input.summary {
        Some(s) => s.clone(),
        None => existing.summary.clone(),
    };
    let importance = input.importance.unwrap_or(existing.importance).clamp(1, 10);
    let tags = input.tags.clone().unwrap_or(existing.tags);
    let tags_json = serde_json::to_string(&tags)?;
    let now = now_ms();

    let conn = pool.get()?;
    conn.execute(
        "UPDATE memories
         SET content = ?1, summary = ?2, importance = ?3, tags = ?4, updated_at = ?5
         WHERE id = ?6",
        params![content, summary, importance, tags_json, now, id],
    )?;

    Ok(Memory {
        id,
        content,
        summary,
        source: existing.source,
        importance,
        tags,
        created_at: existing.created_at,
        updated_at: now,
        archived: existing.archived,
    })
}

pub fn set_archived(pool: &DbPool, id: i64, archived: bool) -> Result<Memory> {
    let conn = pool.get()?;
    let now = now_ms();
    conn.execute(
        "UPDATE memories SET archived = ?1, updated_at = ?2 WHERE id = ?3",
        params![archived as i32, now, id],
    )?;
    get_memory(pool, id)?.ok_or_else(|| anyhow::anyhow!("memory {} not found", id))
}

pub fn delete_memory(pool: &DbPool, id: i64) -> Result<()> {
    let conn = pool.get()?;
    // embeddings row cascades via FK ON DELETE CASCADE.
    conn.execute("DELETE FROM memories WHERE id = ?1", params![id])?;
    Ok(())
}

// ---- Embedding storage helpers (used by rag.rs and extractor) ----

/// Store the embedding for a memory, replacing any existing one.
pub fn store_embedding(
    pool: &DbPool,
    memory_id: i64,
    vector: &[f32],
    model: &str,
) -> Result<()> {
    let conn = pool.get()?;
    let bytes: Vec<u8> = vector
        .iter()
        .flat_map(|f| f.to_le_bytes())
        .collect();
    let dim = vector.len() as i64;
    let now = now_ms();
    conn.execute(
        "INSERT INTO embeddings (memory_id, vector, dim, model, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(memory_id) DO UPDATE SET
            vector = excluded.vector,
            dim = excluded.dim,
            model = excluded.model,
            created_at = excluded.created_at",
        params![memory_id, bytes, dim, model, now],
    )?;
    Ok(())
}

/// Load every (memory_id, embedding, importance) triple for brute-force cosine
/// search. Skips archived memories. (importance is folded into the score.)
pub fn load_all_embeddings(pool: &DbPool) -> Result<Vec<(i64, Vec<f32>, i32)>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT e.memory_id, e.vector, m.importance
         FROM embeddings e
         JOIN memories m ON m.id = e.memory_id
         WHERE m.archived = 0",
    )?;
    let rows = stmt.query_map([], |r| {
        let memory_id: i64 = r.get(0)?;
        let blob: Vec<u8> = r.get(1)?;
        let importance: i32 = r.get(2)?;
        let vector: Vec<f32> = blob
            .chunks_exact(4)
            .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
            .collect();
        Ok((memory_id, vector, importance))
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}
