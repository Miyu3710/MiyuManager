use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaySessionRecord {
    pub id: i64,
    pub work_id: i64,
    pub local_copy_id: i64,
    pub launch_id: Option<String>,
    pub status: String,
    pub started_at: String,
    pub last_heartbeat_at: String,
    pub ended_at: Option<String>,
    pub duration_sec: i64,
    pub end_reason: Option<String>,
    pub source: String,
    pub process_id: Option<i64>,
    pub exe_path: Option<String>,
    pub note: String,
    pub corrected: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaySessionWithWork {
    #[serde(flatten)]
    pub session: PlaySessionRecord,
    pub work_title: String,
    pub original_title: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaySessionEvent {
    pub action: String,
    #[serde(flatten)]
    pub payload: PlaySessionWithWork,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCreateInput {
    pub work_id: i64,
    pub started_at: String,
    pub ended_at: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUpdateInput {
    pub started_at: String,
    pub ended_at: String,
    #[serde(default)]
    pub note: String,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StatsPeriod {
    Week,
    Month,
    Year,
    #[default]
    All,
}

impl StatsPeriod {
    pub fn parse(value: Option<&str>) -> Self {
        match value.unwrap_or("all") {
            "week" => Self::Week,
            "month" => Self::Month,
            "year" => Self::Year,
            _ => Self::All,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Week => "week",
            Self::Month => "month",
            Self::Year => "year",
            Self::All => "all",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyPlaytime {
    pub date: String,
    pub seconds: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopGame {
    pub work_id: i64,
    pub title: String,
    pub original_title: String,
    pub seconds: i64,
    pub session_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsOverview {
    pub all_time_seconds: i64,
    pub all_time_sessions: i64,
    pub last7_seconds: i64,
    pub last30_seconds: i64,
    pub current_week_launches: i64,
    pub current_week_games: i64,
    pub previous7_seconds: i64,
    pub range: String,
    pub range_seconds: i64,
    pub range_launches: i64,
    pub daily: Vec<DailyPlaytime>,
    pub top_games: Vec<TopGame>,
    pub recent_sessions: Vec<PlaySessionWithWork>,
}
