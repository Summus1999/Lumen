use anyhow::{anyhow, Context, Result};
use reqwest::Client;

use super::types::{
    ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse,
};

/// GLM（智谱 BigModel）OpenAI 兼容 API 的轻量 HTTP 客户端。
///
/// 端点（相对于 `base_url`，默认 `https://open.bigmodel.cn/api/paas/v4`）：
///   - POST /chat/completions
///   - POST /embeddings
///
/// 认证：`Authorization: Bearer {api_key}`。
pub struct GlmClient {
    http: Client,
    base_url: String,
    api_key: String,
}

impl GlmClient {
    pub fn new(base_url: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            http: Client::builder()
                .user_agent("Lumen/0.1")
                .build()
                .expect("reqwest client builds"),
            base_url: base_url.into().trim_end_matches('/').to_string(),
            api_key: api_key.into(),
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}/{}", self.base_url, path.trim_start_matches('/'))
    }

    /// 运行聊天补全并返回第一个选项的内容。
    pub async fn chat(&self, req: &ChatRequest) -> Result<String> {
        let resp = self
            .http
            .post(self.url("/chat/completions"))
            .bearer_auth(&self.api_key)
            .json(req)
            .send()
            .await
            .context("GLM chat request failed")?;

        let status = resp.status();
        let body = resp.text().await.context("reading GLM chat body")?;
        if !status.is_success() {
            return Err(anyhow!("GLM chat error ({}): {}", status, body));
        }

        let parsed: ChatResponse = serde_json::from_str(&body)
            .with_context(|| format!("parsing GLM chat response: {body}"))?;

        parsed
            .choices
            .into_iter()
            .next()
            .map(|c| c.message.content)
            .ok_or_else(|| anyhow!("GLM chat returned no choices"))
    }

    /// 对单条文本生成嵌入并返回其向量。
    pub async fn embed(&self, model: &str, input: &str) -> Result<Vec<f32>> {
        let req = EmbeddingRequest {
            model: model.to_string(),
            input: input.to_string(),
        };
        let resp = self
            .http
            .post(self.url("/embeddings"))
            .bearer_auth(&self.api_key)
            .json(&req)
            .send()
            .await
            .context("GLM embedding request failed")?;

        let status = resp.status();
        let body = resp.text().await.context("reading GLM embedding body")?;
        if !status.is_success() {
            return Err(anyhow!("GLM embedding error ({}): {}", status, body));
        }

        let parsed: EmbeddingResponse = serde_json::from_str(&body)
            .with_context(|| format!("parsing GLM embedding response: {body}"))?;

        parsed
            .data
            .into_iter()
            .next()
            .map(|d| d.embedding)
            .ok_or_else(|| anyhow!("GLM embedding returned no data"))
    }
}
