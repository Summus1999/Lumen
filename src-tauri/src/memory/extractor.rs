use anyhow::{Context, Result};
use serde::Deserialize;

use crate::db::DbPool;
use crate::llm::{ChatMessage, ChatRequest, GlmClient};
use crate::memory::store::{self, MemoryInput, MemorySource};
use crate::memory::rag;

/// One fact extracted by the LLM from a conversation.
#[derive(Debug, Clone, Deserialize)]
struct ExtractedFact {
    content: String,
    #[serde(default = "default_importance")]
    importance: i32,
    #[serde(default)]
    tags: Vec<String>,
}
fn default_importance() -> i32 {
    5
}
#[derive(Debug, Clone, Deserialize)]
struct ExtractionResult {
    #[serde(default)]
    facts: Vec<ExtractedFact>,
}

/// Run the extractor over the most recent messages of a conversation and
/// persist any new facts as `source = chat` memories (with embeddings).
///
/// `recent_turns` is a flat list of (role, content) pairs, newest last.
pub async fn extract_and_store(
    pool: &DbPool,
    client: &GlmClient,
    chat_model: &str,
    embedding_model: &str,
    recent_turns: &[(String, String)],
) -> Result<Vec<i64>> {
    if recent_turns.is_empty() {
        return Ok(Vec::new());
    }

    let transcript = recent_turns
        .iter()
        .map(|(role, content)| format!("{}: {}", role, content))
        .collect::<Vec<_>>()
        .join("\n");

    let system = "你是一个记忆抽取器。从下面这段用户与助手的对话中，抽取关于用户的【持久性事实】，比如兴趣、正在做的事、偏好、计划、技术栈等。\
忽略一次性闲聊和助手的回答内容。\
每条事实给出 importance（1-10，越长期越重要）和 tags（关键词数组，可为空）。\
只返回 JSON，格式：{\"facts\":[{\"content\":\"...\",\"importance\":5,\"tags\":[\"AI\"]}]}。\
如果没有值得记忆的事实，返回 {\"facts\":[]}。";

    let req = ChatRequest {
        model: chat_model.to_string(),
        messages: vec![
            ChatMessage {
                role: "system".into(),
                content: system.into(),
            },
            ChatMessage {
                role: "user".into(),
                content: transcript,
            },
        ],
        temperature: Some(0.2),
        max_tokens: Some(900),
    };

    let raw = client.chat(&req).await.context("extractor chat call")?;
    let json_str = extract_json(&raw).unwrap_or(&raw);
    let parsed: ExtractionResult = serde_json::from_str(json_str)
        .with_context(|| format!("parsing extractor JSON from: {raw}"))?;

    let mut ids = Vec::new();
    for fact in parsed.facts {
        let content = fact.content.trim().to_string();
        if content.is_empty() {
            continue;
        }
        let input = MemoryInput {
            content: Some(content.clone()),
            summary: None,
            source: Some(MemorySource::Chat),
            importance: Some(fact.importance.clamp(1, 10)),
            tags: Some(fact.tags),
            archived: None,
        };
        match store::add_memory(pool, &input) {
            Ok(memory) => {
                // Embed in background; if it fails we log but keep the memory row.
                if let Err(e) =
                    rag::embed_and_store(pool, client, embedding_model, memory.id, &content).await
                {
                    log::warn!("embedding failed for memory {}: {}", memory.id, e);
                }
                ids.push(memory.id);
            }
            Err(e) => log::warn!("add_memory failed: {}", e),
        }
    }
    Ok(ids)
}

/// The model sometimes wraps JSON in prose or code fences. Pull out the first
/// balanced {...} block we can find.
fn extract_json(s: &str) -> Option<&str> {
    let start = s.find('{')?;
    let mut depth = 0i32;
    let bytes = s.as_bytes();
    let mut i = start;
    while i < bytes.len() {
        match bytes[i] {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&s[start..=i]);
                }
            }
            _ => {}
        }
        i += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_plain_json() {
        let s = r#"{"facts":[{"content":"x","importance":3,"tags":[]}]}"#;
        assert_eq!(extract_json(s), Some(s));
    }

    #[test]
    fn extracts_json_in_prose() {
        let s = "好的，结果如下：\n```json\n{\"facts\":[]}\n```\n完毕";
        let got = extract_json(s).unwrap();
        assert!(got.starts_with('{') && got.ends_with('}'));
    }
}
