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
    #[serde(default)]
    pub covers: Vec<CoverOption>,
    pub related: Vec<RelatedWork>,
    #[serde(skip_serializing)]
    pub raw_json: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverOption {
    pub url: String,
    pub kind: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
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
    pub conflict: bool,
    pub preferred_claim_id: Option<i64>,
    pub current_claim_id: Option<i64>,
    pub claims: Vec<MetadataClaimRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkSourceLink {
    pub provider: String,
    pub source_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceLinkInput {
    pub provider: String,
    pub source_id: String,
    #[serde(default)]
    pub title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataWorkState {
    pub work_id: i64,
    pub providers: Vec<ProviderInfo>,
    pub fields: Vec<MetadataFieldState>,
    pub source_links: Vec<WorkSourceLink>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimPreview {
    pub source: String,
    pub source_id: String,
    pub value: Value,
    pub priority: i64,
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
    pub default_selected: bool,
    pub priority: i64,
    pub existing: Vec<ClaimPreview>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCover {
    pub current_source: Option<String>,
    pub candidate_url: String,
    pub kind: String,
    pub default_selected: bool,
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
    pub cover_options: Vec<PreviewCover>,
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
    #[serde(default)]
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataImportResult {
    pub applied: Vec<String>,
    pub cover_applied: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldPriorityProvider {
    pub provider: String,
    pub provider_name: String,
    pub priority: i64,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FieldPriorityState {
    pub field: String,
    pub label: String,
    pub providers: Vec<FieldPriorityProvider>,
    pub custom: bool,
    pub global: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeMatch {
    pub provider: String,
    pub provider_name: String,
    pub source_id: String,
    pub title: String,
    pub original_title: String,
    pub year: Option<i64>,
    pub score: f64,
    pub priority: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeFieldCandidate {
    pub provider: String,
    pub provider_name: String,
    pub source_id: String,
    pub value: Value,
    pub priority: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeFieldState {
    pub field: String,
    pub label: String,
    pub current: Value,
    pub candidates: Vec<MergeFieldCandidate>,
    pub default_selected: bool,
    pub conflict: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeCoverCandidate {
    pub provider: String,
    pub provider_name: String,
    pub source_id: String,
    pub url: String,
    pub kind: String,
    pub priority: i64,
    pub default_selected: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergePreview {
    pub work_id: i64,
    pub title: String,
    pub query: String,
    pub matched: Vec<MergeMatch>,
    pub errors: Vec<ProviderFailure>,
    pub fields: Vec<MergeFieldState>,
    pub covers: Vec<MergeCoverCandidate>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeSelection {
    pub field: String,
    pub provider: String,
    pub source_id: String,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeSourceLink {
    pub provider: String,
    pub source_id: String,
    #[serde(default)]
    pub title: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeApplyRequest {
    pub work_id: i64,
    pub selections: Vec<MergeSelection>,
    pub cover: Option<MergeSelection>,
    #[serde(default)]
    pub source_links: Vec<MergeSourceLink>,
    #[serde(default)]
    pub only_if_empty: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeApplyResult {
    pub applied: Vec<String>,
    pub skipped_non_empty: Vec<String>,
    pub cover_applied: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchStartRequest {
    pub work_ids: Vec<i64>,
    pub provider_ids: Vec<String>,
    pub include_covers: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchProgress {
    pub job_id: String,
    pub total: usize,
    pub completed: usize,
    pub failed: usize,
    pub skipped: usize,
    pub paused: bool,
    pub cancelled: bool,
    pub current_work_id: Option<i64>,
    pub current_title: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchWorkResult {
    pub job_id: String,
    pub work_id: i64,
    pub title: String,
    pub status: String,
    pub preview: Option<MergePreview>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchComplete {
    pub job_id: String,
    pub total: usize,
    pub completed: usize,
    pub failed: usize,
    pub cancelled: bool,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchApplyRequest {
    pub job_id: String,
    pub work_ids: Vec<i64>,
    pub include_covers: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchApplyWorkResult {
    pub work_id: i64,
    pub title: String,
    pub status: String,
    pub applied: Vec<String>,
    pub skipped_non_empty: Vec<String>,
    pub cover_applied: bool,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchApplyResult {
    pub total: usize,
    pub applied_works: usize,
    pub failed_works: usize,
    pub skipped_works: usize,
    pub applied_fields: usize,
    pub cover_applied: usize,
    pub works: Vec<BatchApplyWorkResult>,
}
