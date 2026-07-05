use anyhow::Result;

use crate::db::DbPool;
use crate::llm::GlmClient;
use crate::memory::store::{self, Memory};

/// A retrieved memory plus its similarity score.
pub struct ScoredMemory {
    pub memory: Memory,
    pub score: f32,
}

/// Embed the query via GLM, then brute-force cosine similarity against every
/// stored (non-archived) embedding, returning the top-k. Importance is folded
/// into the score as `score * (0.5 + importance/20)` so a 10/10 memory gets
/// a 1.0 multiplier and a 1/10 memory gets 0.55.
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

    // Collect (memory_id, weighted_score) pairs first; we hydrate the full
    // Memory rows only for the top_k survivors to avoid needless DB calls.
    let mut scored: Vec<(i64, f32)> = candidates
        .into_iter()
        .filter_map(|(memory_id, vec, importance)| {
            let sim = cosine(&query_vec, &vec);
            if !sim.is_finite() {
                return None;
            }
            let weighted = sim * (0.5 + importance as f32 / 20.0);
            // Only keep reasonably-relevant hits to avoid noise.
            if sim < 0.2 {
                return None;
            }
            Some((memory_id, weighted))
        })
        .collect();

    // Sort by weighted score desc, take top_k.
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);

    // Hydrate full memory rows.
    let mut out = Vec::with_capacity(scored.len());
    for (memory_id, score) in scored {
        if let Some(memory) = store::get_memory(pool, memory_id)? {
            out.push(ScoredMemory { memory, score });
        }
    }
    Ok(out)
}

/// Cosine similarity for two equal-length f32 vectors.
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

/// Embed a memory's content and persist its vector.
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

/// Build the system-prompt context block from retrieved memories.
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
