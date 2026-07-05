use anyhow::{Context, Result};
use serde::Deserialize;

use crate::db::DbPool;
use crate::llm::{ChatMessage, ChatRequest, GlmClient};
use crate::memory::store::{self, MemoryInput, MemoryLayer, MemorySource};
use crate::memory::rag;

/// LLM 从对话中抽取出的一个事实，带 5 层分类。
#[derive(Debug, Clone, Deserialize)]
struct ExtractedFact {
    content: String,
    #[serde(default = "default_importance")]
    importance: i32,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default = "default_layer")]
    layer: MemoryLayer,
    #[serde(default)]
    topic: Option<String>,
}
fn default_importance() -> i32 {
    5
}
fn default_layer() -> MemoryLayer {
    MemoryLayer::Preference
}
#[derive(Debug, Clone, Deserialize)]
struct ExtractionResult {
    #[serde(default)]
    facts: Vec<ExtractedFact>,
}

/// 对对话的最新消息运行抽取器，并将新事实持久化为 source = chat 的记忆（含嵌入）。
///
/// `recent_turns` 是 (role, content) 的扁平列表，最新的在最后。
/// `conversation_id` 用于 session 层记忆关联到当前会话。
pub async fn extract_and_store(
    pool: &DbPool,
    client: &GlmClient,
    chat_model: &str,
    embedding_model: &str,
    recent_turns: &[(String, String)],
    conversation_id: Option<i64>,
) -> Result<Vec<i64>> {
    if recent_turns.is_empty() {
        return Ok(Vec::new());
    }

    let transcript = recent_turns
        .iter()
        .map(|(role, content)| format!("{}: {}", role, content))
        .collect::<Vec<_>>()
        .join("\n");

    let system = "你是一个记忆抽取器。从下面这段用户与助手的对话中，抽取关于用户的持久性事实。\n\
将每条事实归类到以下 5 层之一：\n\
- personal：用户的个人隐私信息（年龄、性别、职业、家庭等）\n\
- technical：用户的技术栈、工具链、框架（如 \"用 Rust 写后端\"、\"用 React 19\"）\n\
- preference：用户对 AI 回答的偏好（如 \"回答要简洁\"、\"用中文\"）\n\
- session：当前会话中产生的、与具体对话相关的持久事实\n\
- page：当前讨论的话题/领域上下文（如 \"在做 React 项目\"），需给出 topic 字段\n\n\
每条事实给出 importance（1-10，越长期越重要）和 tags（关键词数组）。\n\
page 层必须给 topic 字段（话题名称），其它层 topic 留空（null）。\n\
忽略一次性闲聊和助手的回答内容。\n\n\
只返回 JSON：\n\
{\"facts\":[{\"content\":\"...\",\"layer\":\"technical\",\"importance\":7,\"tags\":[\"Rust\"],\"topic\":null}]}\n\
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
        max_tokens: Some(1200),
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
        // session 层自动绑定当前会话；page 层带上 topic；其它层留空。
        let (conversation_id, topic) = match fact.layer {
            MemoryLayer::Session => (conversation_id, None),
            MemoryLayer::Page => (None, fact.topic.filter(|t| !t.trim().is_empty())),
            _ => (None, None),
        };
        let input = MemoryInput {
            content: Some(content.clone()),
            summary: None,
            source: Some(MemorySource::Chat),
            importance: Some(fact.importance.clamp(1, 10)),
            tags: Some(fact.tags),
            archived: None,
            layer: Some(fact.layer),
            conversation_id: Some(conversation_id),
            topic: Some(topic),
        };
        match store::add_memory(pool, &input) {
            Ok(memory) => {
                // 后台生成嵌入；失败则记录日志但保留记忆行。
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

/// 模型有时会把 JSON 包裹在正文或代码块中。找出第一个能匹配的 {...} 块。
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
