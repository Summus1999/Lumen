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

/// 5 层记忆分类。权重用于 RAG 检索时的加权排序。
/// personal 层有硬约束：不可删除、不可归档（仅展示 + 手动改内容）。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MemoryLayer {
    Personal,
    Technical,
    Preference,
    Session,
    Page,
}

impl MemoryLayer {
    pub fn as_str(&self) -> &'static str {
        match self {
            MemoryLayer::Personal => "personal",
            MemoryLayer::Technical => "technical",
            MemoryLayer::Preference => "preference",
            MemoryLayer::Session => "session",
            MemoryLayer::Page => "page",
        }
    }
    /// 未知值回退到 Preference（中性层，避免误保护或误放过）。
    pub fn from_str(s: &str) -> Self {
        match s {
            "personal" => MemoryLayer::Personal,
            "technical" => MemoryLayer::Technical,
            "session" => MemoryLayer::Session,
            "page" => MemoryLayer::Page,
            _ => MemoryLayer::Preference,
        }
    }
    /// RAG 注入时的层权重：personal 最高，page 最低。
    pub fn weight(&self) -> f64 {
        match self {
            MemoryLayer::Personal => 1.0,
            MemoryLayer::Technical => 0.8,
            MemoryLayer::Preference => 0.9,
            MemoryLayer::Session => 0.7,
            MemoryLayer::Page => 0.5,
        }
    }
    pub fn all() -> &'static [MemoryLayer] {
        &[
            MemoryLayer::Personal,
            MemoryLayer::Technical,
            MemoryLayer::Preference,
            MemoryLayer::Session,
            MemoryLayer::Page,
        ]
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
    pub created_at: i64, // Unix 毫秒
    pub updated_at: i64,
    pub archived: bool,
    /// 5 层分类。
    pub layer: MemoryLayer,
    /// 仅 session 层使用：关联到具体会话。
    pub conversation_id: Option<i64>,
    /// 仅 page 层使用：话题/领域标签。
    pub topic: Option<String>,
}

/// 创建或更新记忆的输入。所有可选字段在更新时都会回退到默认值或现有值。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInput {
    pub content: Option<String>,
    pub summary: Option<Option<String>>,
    pub source: Option<MemorySource>,
    pub importance: Option<i32>,
    pub tags: Option<Vec<String>>,
    pub archived: Option<bool>,
    pub layer: Option<MemoryLayer>,
    /// 双 Option 语义：None=不修改，Some(None)=清空，Some(Some(v))=设值。
    pub conversation_id: Option<Option<i64>>,
    pub topic: Option<Option<String>>,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn row_to_memory(row: &rusqlite::Row) -> rusqlite::Result<Memory> {
    let source_str: String = row.get("source")?;
    let tags_json: String = row.get("tags")?;
    let archived_int: i32 = row.get("archived")?;
    let layer_str: String = row.get("layer")?;
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
        layer: MemoryLayer::from_str(&layer_str),
        conversation_id: row.get("conversation_id")?,
        topic: row.get("topic")?,
    })
}

/// 列出记忆。传 layer 则只返回该层，否则返回全部。
pub fn list_memories(pool: &DbPool, layer: Option<MemoryLayer>) -> Result<Vec<Memory>> {
    let conn = pool.get()?;
    let mut out = Vec::new();
    match layer {
        Some(l) => {
            let mut stmt = conn.prepare(
                "SELECT id, content, summary, source, importance, tags, created_at, updated_at, archived, layer, conversation_id, topic
                 FROM memories
                 WHERE layer = ?1
                 ORDER BY updated_at DESC",
            )?;
            let rows = stmt.query_map(params![l.as_str()], row_to_memory)?;
            for r in rows {
                out.push(r?);
            }
        }
        None => {
            let mut stmt = conn.prepare(
                "SELECT id, content, summary, source, importance, tags, created_at, updated_at, archived, layer, conversation_id, topic
                 FROM memories
                 ORDER BY updated_at DESC",
            )?;
            let rows = stmt.query_map([], row_to_memory)?;
            for r in rows {
                out.push(r?);
            }
        }
    }
    Ok(out)
}

pub fn get_memory(pool: &DbPool, id: i64) -> Result<Option<Memory>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, content, summary, source, importance, tags, created_at, updated_at, archived, layer, conversation_id, topic
         FROM memories WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], row_to_memory)?;
    if let Some(r) = rows.next() {
        Ok(Some(r?))
    } else {
        Ok(None)
    }
}

/// 插入一条记忆并返回它（不含嵌入——调用方需随后调用 rag::embed_and_store）。
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
    let layer = input.layer.unwrap_or(MemoryLayer::Preference);
    // session 层的 conversation_id 由调用方传入；其它层为 None。
    let conversation_id = match &input.conversation_id {
        Some(v) => *v,
        None => None,
    };
    // page 层的 topic 由调用方传入；其它层为 None。
    let topic = match &input.topic {
        Some(v) => v.clone(),
        None => None,
    };

    conn.execute(
        "INSERT INTO memories (content, summary, source, importance, tags, created_at, updated_at, archived, layer, conversation_id, topic)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0, ?8, ?9, ?10)",
        params![content, summary, source.as_str(), importance, tags_json, now, now, layer.as_str(), conversation_id, topic],
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
        layer,
        conversation_id,
        topic,
    })
}

/// 更新已有记忆的指定字段。仅提供的字段会被修改。
/// personal 层保护：不允许把 layer 从 personal 改成其它层，也不允许把其它层改成 personal。
pub fn update_memory(pool: &DbPool, id: i64, input: &MemoryInput) -> Result<Memory> {
    let existing = get_memory(pool, id)?
        .ok_or_else(|| anyhow::anyhow!("memory {} not found", id))?;

    // personal 层的 layer 锁定：禁止 personal 与其它层互转。
    if let Some(new_layer) = &input.layer {
        if existing.layer == MemoryLayer::Personal && *new_layer != MemoryLayer::Personal {
            anyhow::bail!("个人记忆不可改层");
        }
        if existing.layer != MemoryLayer::Personal && *new_layer == MemoryLayer::Personal {
            anyhow::bail!("其它层记忆不可改为个人记忆");
        }
    }

    let content = input.content.clone().unwrap_or(existing.content);
    let summary = match &input.summary {
        Some(s) => s.clone(),
        None => existing.summary.clone(),
    };
    // 修复：原 update 未更新 source，现在补上（AGENTS.md §6.3 修 bug 注根因）。
    let source = input.source.unwrap_or(existing.source);
    let importance = input.importance.unwrap_or(existing.importance).clamp(1, 10);
    let tags = input.tags.clone().unwrap_or(existing.tags);
    let tags_json = serde_json::to_string(&tags)?;
    let layer = input.layer.unwrap_or(existing.layer);
    let conversation_id = match &input.conversation_id {
        Some(v) => *v,
        None => existing.conversation_id,
    };
    let topic = match &input.topic {
        Some(v) => v.clone(),
        None => existing.topic.clone(),
    };
    let now = now_ms();

    let conn = pool.get()?;
    conn.execute(
        "UPDATE memories
         SET content = ?1, summary = ?2, source = ?3, importance = ?4, tags = ?5, updated_at = ?6,
             layer = ?7, conversation_id = ?8, topic = ?9
         WHERE id = ?10",
        params![content, summary, source.as_str(), importance, tags_json, now, layer.as_str(), conversation_id, topic, id],
    )?;

    Ok(Memory {
        id,
        content,
        summary,
        source,
        importance,
        tags,
        created_at: existing.created_at,
        updated_at: now,
        archived: existing.archived,
        layer,
        conversation_id,
        topic,
    })
}

pub fn set_archived(pool: &DbPool, id: i64, archived: bool) -> Result<Memory> {
    // personal 层禁止归档。
    let existing = get_memory(pool, id)?
        .ok_or_else(|| anyhow::anyhow!("memory {} not found", id))?;
    if existing.layer == MemoryLayer::Personal {
        anyhow::bail!("个人记忆不可归档");
    }
    let conn = pool.get()?;
    let now = now_ms();
    conn.execute(
        "UPDATE memories SET archived = ?1, updated_at = ?2 WHERE id = ?3",
        params![archived as i32, now, id],
    )?;
    get_memory(pool, id)?.ok_or_else(|| anyhow::anyhow!("memory {} not found", id))
}

pub fn delete_memory(pool: &DbPool, id: i64) -> Result<()> {
    // personal 层禁止删除。
    let existing = get_memory(pool, id)?
        .ok_or_else(|| anyhow::anyhow!("memory {} not found", id))?;
    if existing.layer == MemoryLayer::Personal {
        anyhow::bail!("个人记忆不可删除");
    }
    let conn = pool.get()?;
    // embeddings 行会通过外键 ON DELETE CASCADE 级联删除。
    conn.execute("DELETE FROM memories WHERE id = ?1", params![id])?;
    Ok(())
}

// ---- 嵌入存储辅助函数（rag.rs 与 extractor 使用）----

/// 存储一条记忆的嵌入向量，覆盖已有数据。
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

/// RAG 检索的候选元组：memory_id + 向量 + 加权所需的元数据。
pub struct EmbeddingCandidate {
    pub memory_id: i64,
    pub vector: Vec<f32>,
    pub importance: i32,
    pub layer: MemoryLayer,
    pub conversation_id: Option<i64>,
    pub topic: Option<String>,
}

/// 加载所有未归档记忆的嵌入向量及元数据，用于暴力余弦搜索。
pub fn load_all_embeddings(pool: &DbPool) -> Result<Vec<EmbeddingCandidate>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT e.memory_id, e.vector, m.importance, m.layer, m.conversation_id, m.topic
         FROM embeddings e
         JOIN memories m ON m.id = e.memory_id
         WHERE m.archived = 0",
    )?;
    let rows = stmt.query_map([], |r| {
        let memory_id: i64 = r.get(0)?;
        let blob: Vec<u8> = r.get(1)?;
        let importance: i32 = r.get(2)?;
        let layer_str: String = r.get(3)?;
        let vector: Vec<f32> = blob
            .chunks_exact(4)
            .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
            .collect();
        Ok(EmbeddingCandidate {
            memory_id,
            vector,
            importance,
            layer: MemoryLayer::from_str(&layer_str),
            conversation_id: r.get(4)?,
            topic: r.get(5)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}
