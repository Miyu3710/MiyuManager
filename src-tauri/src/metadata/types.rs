use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub fields: Vec<String>,
    pub priority: i64,
    pub enabled: bool,
    pub requires_auth: bool,
    pub auth_kind: String,
    pub connected: bool,
    pub account_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCandidate {
    pub provider: String,
    pub source_id: String,
    pub title: String,
    pub original_title: String,
    pub year: Option<i64>,
    pub developer: Option<String>,
    pub cover_url: Option<String>,
    pub summary: String,
    pub score: Option<f64>,
    pub priority: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelatedWork {
    pub source_id: String,
    pub relation: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateDetail {
    pub provider: String,
    pub source_id: String,
    pub title: String,
    pub original_title: String,
    pub aliases: Vec<String>,
    pub description: String,
    pub release_date: Option<String>,
    pub year: Option<i64>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub tags: Vec<String>,
    pub cover_url: Option<String>,
    pub related: Vec<RelatedWork>,
    #[serde(skip_serializing)]
    pub raw_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderFailure {
    pub provider: String,
    pub provider_name: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataJobStart {
    pub job_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSearchProgress {
    pub job_id: String,
    pub work_id: i64,
    pub provider: String,
    pub provider_name: String,
    pub completed: usize,
    pub total: usize,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSearchComplete {
    pub job_id: String,
    pub work_id: i64,
    pub query: String,
    pub results: Vec<SearchCandidate>,
    pub errors: Vec<ProviderFailure>,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSearchError {
    pub job_id: String,
    pub work_id: i64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataClaimRecord {
    pub id: i64,
    pub field: String,
    pub source: String,
    pub source_id: String,
    pub value: Value,
    pub confidence: Option<f64>,
    pub locked: bool,
    pub fetched_at: String,
    pub provider_name: String,
    pub priority: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataFieldState {
    pub field: String,
    pub label: String,
    pub current: Value,
    pub source: Option<String>,
    pub source_id: Option<String>,
    pub locked: bool,
    pub lock_source: Option<String>,
    pub claims: Vec<MetadataClaimRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataWorkState {
    pub work_id: i64,
    pub providers: Vec<ProviderInfo>,
    pub fields: Vec<MetadataFieldState>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimPreview {
    pub source: String,
    pub source_id: String,
    pub value: Value,
    pub priority: i64,
    pub locked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewField {
    pub field: String,
    pub label: String,
    pub current: Value,
    pub candidate: Value,
    pub source: String,
    pub source_id: String,
    pub locked: bool,
    pub lock_source: Option<String>,
    pub default_selected: bool,
    pub priority: i64,
    pub existing: Vec<ClaimPreview>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCover {
    pub current_source: Option<String>,
    pub candidate_url: String,
    pub default_selected: bool,
    pub locked: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataPreview {
    pub work_id: i64,
    pub provider: String,
    pub provider_name: String,
    pub source_id: String,
    pub candidate: CandidateDetail,
    pub fields: Vec<PreviewField>,
    pub cover: Option<PreviewCover>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataImportRequest {
    pub work_id: i64,
    pub provider: String,
    pub source_id: String,
    #[serde(default)]
    pub selected_fields: Vec<String>,
    #[serde(default)]
    pub selected_cover: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataImportResult {
    pub applied: Vec<String>,
    pub skipped_locked: Vec<String>,
    pub cover_applied: bool,
}
