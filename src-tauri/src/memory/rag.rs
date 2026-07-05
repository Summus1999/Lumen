use anyhow::Result;

use crate::db::DbPool;
use crate::llm::GlmClient;
use crate::memory::store::{self, Memory, MemoryLayer};

/// 检索到的记忆及其相似度分数。
pub struct ScoredMemory {
    pub memory: Memory,
    pub score: f32,
}

/// RAG 检索时的上下文，用于 session/page 层记忆的上下文加成。
pub struct RetrieveContext {
    /// 当前会话 ID，session 层记忆匹配时加权。
    pub conversation_id: Option<i64>,
    /// 当前话题，page 层记忆匹配时加权（简单子串匹配）。
    pub topic: Option<String>,
}

/// 通过 GLM 对查询生成嵌入，然后与所有已存储（未归档）的嵌入做暴力余弦相似度，
/// 返回 Top-K。最终分数 = cosine × 层权重 × 上下文加成 × (0.5 + importance/20)。
/// 层权重：personal 1.0 / technical 0.8 / preference 0.9 / session 0.7 / page 0.5。
/// session 层在当前会话内加成 1.2，会话外衰减到 0.3。
/// page 层话题匹配时加成 1.1，不匹配时衰减到 0.4。
pub async fn retrieve(
    pool: &DbPool,
    client: &GlmClient,
    embedding_model: &str,
    query: &str,
    top_k: usize,
    context: &RetrieveContext,
) -> Result<Vec<ScoredMemory>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let query_vec = client.embed(embedding_model, query).await?;

    let candidates = store::load_all_embeddings(pool)?;
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    // 先收集 (memory_id, weighted_score) 对；仅对 Top-K 结果补全完整 Memory 行。
    let mut scored: Vec<(i64, f32)> = candidates
        .into_iter()
        .filter_map(|c| {
            let sim = cosine(&query_vec, &c.vector);
            if !sim.is_finite() {
                return None;
            }
            // 只保留相关度足够高的结果，避免噪声。
            if sim < 0.2 {
                return None;
            }
            let layer_weight = c.layer.weight();
            // 上下文加成：session/page 层根据当前上下文动态调整权重。
            let context_boost = match c.layer {
                MemoryLayer::Session => {
                    if c.conversation_id == context.conversation_id {
                        1.2
                    } else {
                        0.3
                    }
                }
                MemoryLayer::Page => {
                    // 话题匹配用简单子串包含，避免引入 embedding 相似度的复杂度。
                    let matched = context.topic.as_ref().map_or(false, |t| {
                        c.topic.as_ref().map_or(false, |mt| t.contains(mt) || mt.contains(t))
                    });
                    if matched {
                        1.1
                    } else {
                        0.4
                    }
                }
                _ => 1.0,
            };
            let weighted =
                sim * (layer_weight as f32) * (context_boost as f32) * (0.5 + c.importance as f32 / 20.0);
            Some((c.memory_id, weighted))
        })
        .collect();

    // 按加权分数降序排序，取前 top_k 个。
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);

    // 补全完整记忆行。
    let mut out = Vec::with_capacity(scored.len());
    for (memory_id, score) in scored {
        if let Some(memory) = store::get_memory(pool, memory_id)? {
            out.push(ScoredMemory { memory, score });
        }
    }
    Ok(out)
}

/// 两个等长 f32 向量的余弦相似度。
fn cosine(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let mut dot = 0.0f32;
    let mut na = 0.0f32;
    let mut nb = 0.0f32;
    for (x, y) in a.iter().zip(b.iter()) {
        dot += x * y;
        na += x * x;
        nb += y * y;
    }
    let denom = na.sqrt() * nb.sqrt();
    if denom == 0.0 {
        0.0
    } else {
        dot / denom
    }
}

/// 对记忆内容生成嵌入并持久化其向量。
pub async fn embed_and_store(
    pool: &DbPool,
    client: &GlmClient,
    embedding_model: &str,
    memory_id: i64,
    content: &str,
) -> Result<()> {
    let vec = client.embed(embedding_model, content).await?;
    store::store_embedding(pool, memory_id, &vec, embedding_model)?;
    Ok(())
}

/// 从检索到的记忆构建系统提示上下文块，按 5 层分组注入。
pub fn build_memory_context(memories: &[ScoredMemory]) -> String {
    if memories.is_empty() {
        return String::from("（暂无关于用户的记忆）");
    }

    // 按 layer 分组，保持检索排序。
    let mut personal: Vec<&ScoredMemory> = Vec::new();
    let mut technical: Vec<&ScoredMemory> = Vec::new();
    let mut preference: Vec<&ScoredMemory> = Vec::new();
    let mut session: Vec<&ScoredMemory> = Vec::new();
    let mut page: Vec<&ScoredMemory> = Vec::new();
    for m in memories {
        match m.memory.layer {
            MemoryLayer::Personal => personal.push(m),
            MemoryLayer::Technical => technical.push(m),
            MemoryLayer::Preference => preference.push(m),
            MemoryLayer::Session => session.push(m),
            MemoryLayer::Page => page.push(m),
        }
    }

    let mut s = String::from("以下是关于用户的分层记忆，回答时参考：\n");
    append_section(&mut s, "【个人档案】", &personal);
    append_section(&mut s, "【技术栈】", &technical);
    append_section(&mut s, "【回答偏好】", &preference);
    append_section(&mut s, "【会话上下文】", &session);
    append_section(&mut s, "【话题上下文】", &page);
    s
}

/// 把一组记忆格式化追加到上下文字符串。空组跳过。
fn append_section(s: &mut String, title: &str, items: &[&ScoredMemory]) {
    if items.is_empty() {
        return;
    }
    s.push_str(title);
    s.push('\n');
    for (i, m) in items.iter().enumerate() {
        s.push_str(&format!(
            "{}. [重要度{}/10] {}",
            i + 1,
            m.memory.importance,
            m.memory.content
        ));
        // page 层显示话题标签。
        if let Some(t) = &m.memory.topic {
            s.push_str(&format!("（话题：{}）", t));
        }
        if !m.memory.tags.is_empty() {
            s.push_str(&format!("（标签：{}）", m.memory.tags.join(", ")));
        }
        s.push('\n');
    }
}
