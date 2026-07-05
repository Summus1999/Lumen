use anyhow::Result;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::db::DbPool;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub api_key: String,
    pub chat_model: String,
    pub embedding_model: String,
    pub base_url: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            chat_model: "glm-4-flash".to_string(),
            embedding_model: "embedding-3".to_string(),
            base_url: "https://open.bigmodel.cn/api/paas/v4".to_string(),
        }
    }
}

/// All settings are persisted as a single JSON blob under the key "app".
/// Simple and easy to extend with new fields later.
const SETTINGS_KEY: &str = "app";

pub fn get_settings(pool: &DbPool) -> Result<AppSettings> {
    let conn = pool.get()?;
    let row: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![SETTINGS_KEY],
            |r| r.get(0),
        )
        .ok();
    match row {
        Some(json) => {
            let s: AppSettings = serde_json::from_str(&json)?;
            Ok(s)
        }
        None => Ok(AppSettings::default()),
    }
}

pub fn save_settings(pool: &DbPool, settings: &AppSettings) -> Result<AppSettings> {
    let json = serde_json::to_string(settings)?;
    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![SETTINGS_KEY, json],
    )?;
    Ok(settings.clone())
}
