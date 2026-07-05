use anyhow::Result;

use crate::db::DbPool;
use crate::llm::GlmClient;
use crate::memory::store::{self, Memory};

/// 检索到的记忆及其相似度分数。
pub struct ScoredMemory {
    pub memory: Memory,
    pub score: f32,
}

/// 通过 GLM 对查询生成嵌入，然后与所有已存储（未归档）的嵌入做暴力余弦相似度，
/// 返回 Top-K。重要度会折入分数：score * (0.5 + importance/20)，
/// 因此 10/10 的记忆得到 1.0 倍乘，1/10 的记忆得到 0.55 倍乘。
pub async fn retrieve(
    pool: &DbPool,
    client: &GlmClient,
    embedding_model: &str,
    query: &str,
    top_k: usize,
) -> Result<Vec<ScoredMemory>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let query_vec = client.embed(embedding_model, query).await?;

    let candidates = store::load_all_embeddings(pool)?;
    if candidates.is_empty() {
        return Ok(Vec::new());
    }

    // 先收集 (memory_id, weighted_score) 对；仅对 Top-K 结果补全完整 Memory 行，
    // 以避免不必要的数据库查询。
    let mut scored: Vec<(i64, f32)> = candidates
        .into_iter()
        .filter_map(|(memory_id, vec, importance)| {
            let sim = cosine(&query_vec, &vec);
            if !sim.is_finite() {
                return None;
            }
            let weighted = sim * (0.5 + importance as f32 / 20.0);
            // 只保留相关度足够高的结果，避免噪声。
            if sim < 0.2 {
                return None;
            }
            Some((memory_id, weighted))
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

/// 从检索到的记忆构建系统提示上下文块。
pub fn build_memory_context(memories: &[ScoredMemory]) -> String {
    if memories.is_empty() {
        return String::from("（暂无关于用户的记忆）");
    }
    let mut s = String::from("以下是关于用户的长期记忆，回答时可参考：\n");
    for (i, m) in memories.iter().enumerate() {
        s.push_str(&format!(
            "{}. [重要度{}/10] {}",
            i + 1,
            m.memory.importance,
            m.memory.content
        ));
        if !m.memory.tags.is_empty() {
            s.push_str(&format!("（标签：{}）", m.memory.tags.join(", ")));
        }
        s.push('\n');
    }
    s
}
