use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::DbPool;
use crate::llm::{ChatMessage, ChatRequest, GlmClient};
use crate::memory::rag;
use crate::memory::store::{self, Memory, MemoryInput};
use crate::settings::{self, AppSettings};

// ---------- 设置 ----------

#[tauri::command]
pub fn get_settings(pool: State<'_, DbPool>) -> Result<AppSettings, String> {
    settings::get_settings(&pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_settings(
    pool: State<'_, DbPool>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    settings::save_settings(&pool, &settings).map_err(|e| e.to_string())
}

// ---------- 记忆 CRUD ----------

#[tauri::command]
pub fn list_memories(pool: State<'_, DbPool>) -> Result<Vec<Memory>, String> {
    store::list_memories(&pool).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_memory(
    pool: State<'_, DbPool>,
    input: MemoryInput,
) -> Result<Memory, String> {
    // 同步插入记录，如有可能再生成嵌入。
    let memory = store::add_memory(&pool, &input).map_err(|e| e.to_string())?;
    if let Ok(s) = settings::get_settings(&pool) {
        if !s.api_key.is_empty() {
            let client = GlmClient::new(&s.base_url, &s.api_key);
            if let Err(e) =
                rag::embed_and_store(&pool, &client, &s.embedding_model, memory.id, &memory.content)
                    .await
            {
                log::warn!("embedding failed for new memory {}: {}", memory.id, e);
            }
        }
    }
    Ok(memory)
}

#[tauri::command]
pub async fn update_memory(
    pool: State<'_, DbPool>,
    id: i64,
    input: MemoryInput,
) -> Result<Memory, String> {
    let memory = store::update_memory(&pool, id, &input).map_err(|e| e.to_string())?;
    // 内容变更后重新生成嵌入。
    if input.content.is_some() {
        if let Ok(s) = settings::get_settings(&pool) {
            if !s.api_key.is_empty() {
                let client = GlmClient::new(&s.base_url, &s.api_key);
                if let Err(e) =
                    rag::embed_and_store(&pool, &client, &s.embedding_model, memory.id, &memory.content)
                        .await
                {
                    log::warn!("re-embedding failed for memory {}: {}", memory.id, e);
                }
            }
        }
    }
    Ok(memory)
}

#[tauri::command]
pub fn delete_memory(pool: State<'_, DbPool>, id: i64) -> Result<(), String> {
    store::delete_memory(&pool, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_archive(
    pool: State<'_, DbPool>,
    id: i64,
    archived: bool,
) -> Result<Memory, String> {
    store::set_archived(&pool, id, archived).map_err(|e| e.to_string())
}

// ---------- 对话与消息 ----------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: i64,
    pub title: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    pub id: i64,
    pub conversation_id: i64,
    pub role: String,
    pub content: String,
    pub created_at: i64,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[tauri::command]
pub fn list_conversations(pool: State<'_, DbPool>) -> Result<Vec<Conversation>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Conversation {
                id: r.get(0)?,
                title: r.get(1)?,
                created_at: r.get(2)?,
                updated_at: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

#[tauri::command]
pub fn create_conversation(
    pool: State<'_, DbPool>,
    title: Option<String>,
) -> Result<Conversation, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let now = now_ms();
    conn.execute(
        "INSERT INTO conversations (title, created_at, updated_at) VALUES (?1, ?2, ?3)",
        params![title, now, now],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Conversation {
        id,
        title,
        created_at: now,
        updated_at: now,
    })
}

#[tauri::command]
pub fn delete_conversation(pool: State<'_, DbPool>, id: i64) -> Result<(), String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM conversations WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn list_messages(
    pool: State<'_, DbPool>,
    conversation_id: i64,
) -> Result<Vec<StoredMessage>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, conversation_id, role, content, created_at
             FROM messages WHERE conversation_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![conversation_id], |r| {
            Ok(StoredMessage {
                id: r.get(0)?,
                conversation_id: r.get(1)?,
                role: r.get(2)?,
                content: r.get(3)?,
                created_at: r.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

// ---------- 聊天（RAG + 自动抽取）----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatTurn {
    pub conversation_id: Option<i64>,
    pub user_message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResult {
    pub conversation_id: i64,
    pub user_message_id: i64,
    pub assistant_message_id: i64,
    pub assistant_content: String,
    pub retrieved_memory_ids: Vec<i64>,
    pub extracted_memory_ids: Vec<i64>,
}

#[tauri::command]
pub async fn chat(
    pool: State<'_, DbPool>,
    turn: ChatTurn,
) -> Result<ChatResult, String> {
    let settings = settings::get_settings(&pool).map_err(|e| e.to_string())?;
    if settings.api_key.trim().is_empty() {
        return Err("尚未配置 GLM API Key，请先到设置页填写。".into());
    }

    let client = GlmClient::new(&settings.base_url, &settings.api_key);

    // 1) 确保对话存在。
    let conversation_id = match turn.conversation_id {
        Some(id) => id,
        None => {
            let title = derive_title(&turn.user_message);
            create_conversation_inner(&pool, Some(title))?.id
        }
    };

    // 2) 持久化用户消息。
    let now = now_ms();
    let user_msg_id = {
        let conn = pool.get().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at)
             VALUES (?1, 'user', ?2, ?3)",
            params![conversation_id, turn.user_message, now],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
            params![now, conversation_id],
        )
        .map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };

    // 3) RAG：对用户消息生成嵌入并检索 Top-5 记忆。
    let retrieved = rag::retrieve(&pool, &client, &settings.embedding_model, &turn.user_message, 5)
        .await
        .unwrap_or_else(|e| {
            log::warn!("RAG retrieve failed: {}", e);
            Vec::new()
        });
    let retrieved_memory_ids: Vec<i64> = retrieved.iter().map(|m| m.memory.id).collect();
    let memory_context = rag::build_memory_context(&retrieved);

    // 4) 用历史消息 + 系统提示构建聊天请求。
    let prior = list_messages_raw(&pool, conversation_id).map_err(|e| e.to_string())?;
    let mut messages = Vec::with_capacity(prior.len() + 1);
    messages.push(ChatMessage {
        role: "system".into(),
        content: format!(
            "你是 Lumen，用户的本地记忆助手。回答简洁、有用，使用中文。\n{}",
            memory_context
        ),
    });
    for m in prior {
        messages.push(ChatMessage {
            role: m.0,
            content: m.1,
        });
    }

    let req = ChatRequest {
        model: settings.chat_model.clone(),
        messages,
        temperature: Some(0.7),
        max_tokens: Some(2048),
    };

    let assistant_content = client.chat(&req).await.map_err(|e| e.to_string())?;

    // 5) 持久化助手消息。
    let assistant_msg_id = {
        let conn = pool.get().map_err(|e| e.to_string())?;
        let now = now_ms();
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content, created_at)
             VALUES (?1, 'assistant', ?2, ?3)",
            params![conversation_id, assistant_content, now],
        )
        .map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE conversations SET updated_at = ?1 WHERE id = ?2",
            params![now, conversation_id],
        )
        .map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };

    // 6) 后台：从本轮对话（用户消息 + 助手回复）中抽取事实。
    //    失败不影响结果——聊天已经成功。
    let extracted_memory_ids = {
        let recent = vec![
            ("user".to_string(), turn.user_message.clone()),
            ("assistant".to_string(), assistant_content.clone()),
        ];
        match crate::memory::extractor::extract_and_store(
            &pool,
            &client,
            &settings.chat_model,
            &settings.embedding_model,
            &recent,
        )
        .await
        {
            Ok(ids) => ids,
            Err(e) => {
                log::warn!("memory extraction failed: {}", e);
                Vec::new()
            }
        }
    };

    Ok(ChatResult {
        conversation_id,
        user_message_id: user_msg_id,
        assistant_message_id: assistant_msg_id,
        assistant_content,
        retrieved_memory_ids,
        extracted_memory_ids,
    })
}

// ---------- 辅助函数 ----------

fn create_conversation_inner(
    pool: &DbPool,
    title: Option<String>,
) -> Result<Conversation, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let now = now_ms();
    conn.execute(
        "INSERT INTO conversations (title, created_at, updated_at) VALUES (?1, ?2, ?3)",
        params![title, now, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(Conversation {
        id: conn.last_insert_rowid(),
        title,
        created_at: now,
        updated_at: now,
    })
}

/// 返回对话的 (role, content) 列表，按时间从早到晚排列，排除系统消息
/// （我们每轮都会重新合成系统提示）。
fn list_messages_raw(pool: &DbPool, conversation_id: i64) -> Result<Vec<(String, String)>, String> {
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT role, content FROM messages
             WHERE conversation_id = ?1 AND role != 'system'
             ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![conversation_id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

/// 从第一条用户消息派生简短的对话标题。
fn derive_title(s: &str) -> String {
    let s = s.trim();
    if s.chars().count() <= 24 {
        return s.to_string();
    }
    let mut out: String = s.chars().take(22).collect();
    out.push('…');
    out
}

// 重新导出，让其他模块无需重复路径即可访问。

