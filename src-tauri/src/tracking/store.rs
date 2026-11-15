use std::collections::HashMap;

use anyhow::{Context, Result, bail};
use chrono::{
    DateTime, Datelike, Duration as ChronoDuration, Local, LocalResult, NaiveDate, TimeZone, Utc,
};
use sqlx::{Row, SqlitePool};

use super::types::{
    DailyPlaytime, PlaySessionRecord, PlaySessionWithWork, SessionCreateInput, SessionUpdateInput,
    StatsOverview, StatsPeriod, TopGame,
};

const SESSION_SELECT: &str = "
SELECT ps.id, ps.local_copy_id, ps.launch_id, ps.status, ps.started_at,
       ps.last_heartbeat_at, ps.ended_at, ps.duration_sec, ps.end_reason,
       ps.source, ps.process_id, ps.exe_path, ps.note, ps.corrected,
       r.work_id, w.canonical_title AS work_title, w.original_title
FROM play_sessions ps
JOIN local_copies lc ON lc.id = ps.local_copy_id
JOIN releases r ON r.id = lc.release_id
JOIN works w ON w.id = r.work_id
";

fn format_timestamp(value: DateTime<Utc>) -> String {
    value.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn parse_timestamp(value: &str, label: &str) -> Result<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value.trim())
        .with_context(|| format!("{label}不是有效时间"))
        .map(|value| value.with_timezone(&Utc))
}

fn normalized_range(start: &str, end: &str) -> Result<(String, String, i64)> {
    let start = parse_timestamp(start, "开始时间")?;
    let end = parse_timestamp(end, "结束时间")?;
    if end <= start {
        bail!("结束时间必须晚于开始时间");
    }
    if end > Utc::now() + ChronoDuration::minutes(5) {
        bail!("结束时间不能位于未来");
    }
    let duration_sec = end.signed_duration_since(start).num_seconds();
    Ok((format_timestamp(start), format_timestamp(end), duration_sec))
}

fn normalized_note(value: &str) -> Result<String> {
    let note = value.trim().to_string();
    if note.chars().count() > 2000 {
        bail!("会话备注不能超过 2000 个字符");
    }
    Ok(note)
}

fn row_to_session(row: &sqlx::sqlite::SqliteRow) -> Result<PlaySessionWithWork> {
    Ok(PlaySessionWithWork {
        session: PlaySessionRecord {
            id: row.try_get("id")?,
            work_id: row.try_get("work_id")?,
            local_copy_id: row.try_get("local_copy_id")?,
            launch_id: row.try_get("launch_id")?,
            status: row.try_get("status")?,
            started_at: row.try_get("started_at")?,
            last_heartbeat_at: row.try_get("last_heartbeat_at")?,
            ended_at: row.try_get("ended_at")?,
            duration_sec: row.try_get("duration_sec")?,
            end_reason: row.try_get("end_reason")?,
            source: row.try_get("source")?,
            process_id: row.try_get("process_id")?,
            exe_path: row.try_get("exe_path")?,
            note: row.try_get("note")?,
            corrected: row.try_get::<i64, _>("corrected")? != 0,
        },
        work_title: row.try_get("work_title")?,
        original_title: row.try_get("original_title")?,
    })
}

pub async fn start_session(
    pool: &SqlitePool,
    local_copy_id: i64,
    launch_id: &str,
    process_id: u32,
    exe_path: &str,
) -> Result<PlaySessionWithWork> {
    let now = format_timestamp(Utc::now());
    let mut transaction = pool.begin().await?;
    let exists: Option<i64> = sqlx::query_scalar("SELECT id FROM local_copies WHERE id = ?")
        .bind(local_copy_id)
        .fetch_optional(&mut *transaction)
        .await?;
    if exists.is_none() {
        bail!("本地安装副本不存在");
    }

    let result = sqlx::query(
        "INSERT INTO play_sessions
           (local_copy_id, launch_id, status, started_at, last_heartbeat_at,
            duration_sec, source, process_id, exe_path)
         VALUES (?, ?, 'running', ?, ?, 0, 'launcher', ?, ?)",
    )
    .bind(local_copy_id)
    .bind(launch_id)
    .bind(&now)
    .bind(&now)
    .bind(i64::from(process_id))
    .bind(exe_path)
    .execute(&mut *transaction)
    .await?;
    let session_id = result.last_insert_rowid();

    sqlx::query(
        "UPDATE local_copies
         SET last_launched_at = ?, launch_count = launch_count + 1, install_status = 'installed'
         WHERE id = ?",
    )
    .bind(&now)
    .bind(local_copy_id)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;

    get_session_payload(pool, session_id)
        .await?
        .context("游玩会话写入后无法读取")
}

pub async fn heartbeat_session(
    pool: &SqlitePool,
    session_id: i64,
    status: &str,
    duration_sec: i64,
) -> Result<()> {
    if !matches!(status, "running" | "paused") {
        bail!("无效的进行中会话状态：{status}");
    }
    let now = format_timestamp(Utc::now());
    sqlx::query(
        "UPDATE play_sessions
         SET status = ?, duration_sec = ?, last_heartbeat_at = ?, updated_at = ?
         WHERE id = ? AND ended_at IS NULL",
    )
    .bind(status)
    .bind(duration_sec.max(0))
    .bind(&now)
    .bind(&now)
    .bind(session_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn finish_session(
    pool: &SqlitePool,
    session_id: i64,
    duration_sec: i64,
    end_reason: &str,
) -> Result<Option<PlaySessionWithWork>> {
    let now = format_timestamp(Utc::now());
    sqlx::query(
        "UPDATE play_sessions
         SET status = 'ended', ended_at = ?, last_heartbeat_at = ?, duration_sec = ?,
             end_reason = ?, updated_at = ?
         WHERE id = ? AND ended_at IS NULL",
    )
    .bind(&now)
    .bind(&now)
    .bind(duration_sec.max(0))
    .bind(end_reason)
    .bind(&now)
    .bind(session_id)
    .execute(pool)
    .await?;
    get_session_payload(pool, session_id).await
}

pub async fn get_session_payload(
    pool: &SqlitePool,
    session_id: i64,
) -> Result<Option<PlaySessionWithWork>> {
    let sql = format!("{SESSION_SELECT} WHERE ps.id = ? LIMIT 1");
    let row = sqlx::query(&sql)
        .bind(session_id)
        .fetch_optional(pool)
        .await?;
    row.as_ref().map(row_to_session).transpose()
}

pub async fn list_work_sessions(
    pool: &SqlitePool,
    work_id: i64,
) -> Result<Vec<PlaySessionWithWork>> {
    let sql = format!(
        "{SESSION_SELECT} WHERE r.work_id = ? ORDER BY ps.started_at DESC, ps.id DESC LIMIT 200"
    );
    let rows = sqlx::query(&sql).bind(work_id).fetch_all(pool).await?;
    rows.iter().map(row_to_session).collect()
}

pub async fn create_manual_session(
    pool: &SqlitePool,
    input: SessionCreateInput,
) -> Result<PlaySessionWithWork> {
    let (started_at, ended_at, duration_sec) =
        normalized_range(&input.started_at, &input.ended_at)?;
    let note = normalized_note(&input.note)?;
    let mut transaction = pool.begin().await?;
    let copy = sqlx::query(
        "SELECT lc.id, lc.exe_path
         FROM local_copies lc
         JOIN releases r ON r.id = lc.release_id
         WHERE r.work_id = ?
         ORDER BY lc.id ASC LIMIT 1",
    )
    .bind(input.work_id)
    .fetch_optional(&mut *transaction)
    .await?;
    let Some(copy) = copy else {
        bail!("作品没有本地安装副本，无法补录会话");
    };
    let local_copy_id: i64 = copy.try_get("id")?;
    let exe_path: String = copy.try_get("exe_path")?;
    let id: i64 = sqlx::query_scalar(
        "INSERT INTO play_sessions
           (local_copy_id, launch_id, status, started_at, last_heartbeat_at, ended_at,
            duration_sec, end_reason, source, exe_path, note)
         VALUES (?, NULL, 'ended', ?, ?, ?, ?, 'manual', 'manual', ?, ?)
         RETURNING id",
    )
    .bind(local_copy_id)
    .bind(&started_at)
    .bind(&ended_at)
    .bind(&ended_at)
    .bind(duration_sec)
    .bind(&exe_path)
    .bind(&note)
    .fetch_one(&mut *transaction)
    .await?;
    sqlx::query(
        "UPDATE local_copies
         SET launch_count = launch_count + 1,
             last_launched_at = CASE
               WHEN last_launched_at IS NULL OR last_launched_at < ? THEN ?
               ELSE last_launched_at END
         WHERE id = ?",
    )
    .bind(&started_at)
    .bind(&started_at)
    .bind(local_copy_id)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;
    get_session_payload(pool, id)
        .await?
        .context("补录会话后无法读取")
}

pub async fn update_manual_session(
    pool: &SqlitePool,
    session_id: i64,
    input: SessionUpdateInput,
) -> Result<PlaySessionWithWork> {
    let (started_at, ended_at, duration_sec) =
        normalized_range(&input.started_at, &input.ended_at)?;
    let note = normalized_note(&input.note)?;
    let open: Option<Option<String>> =
        sqlx::query_scalar("SELECT ended_at FROM play_sessions WHERE id = ?")
            .bind(session_id)
            .fetch_optional(pool)
            .await?;
    match open {
        None => bail!("游玩会话不存在"),
        Some(None) => bail!("正在运行的会话不能手工修正，请先结束游戏"),
        Some(Some(_)) => {}
    }
    let now = format_timestamp(Utc::now());
    sqlx::query(
        "UPDATE play_sessions
         SET status = 'ended', started_at = ?, ended_at = ?, last_heartbeat_at = ?,
             duration_sec = ?, note = ?, corrected = 1, updated_at = ?
         WHERE id = ?",
    )
    .bind(&started_at)
    .bind(&ended_at)
    .bind(&ended_at)
    .bind(duration_sec)
    .bind(&note)
    .bind(&now)
    .bind(session_id)
    .execute(pool)
    .await?;
    get_session_payload(pool, session_id)
        .await?
        .context("修正会话后无法读取")
}

pub async fn delete_session(pool: &SqlitePool, session_id: i64) -> Result<()> {
    let mut transaction = pool.begin().await?;
    let row = sqlx::query("SELECT local_copy_id, ended_at FROM play_sessions WHERE id = ?")
        .bind(session_id)
        .fetch_optional(&mut *transaction)
        .await?;
    let Some(row) = row else {
        bail!("游玩会话不存在");
    };
    if row.try_get::<Option<String>, _>("ended_at")?.is_none() {
        bail!("正在运行的会话不能删除");
    }
    let local_copy_id: i64 = row.try_get("local_copy_id")?;
    sqlx::query("DELETE FROM play_sessions WHERE id = ?")
        .bind(session_id)
        .execute(&mut *transaction)
        .await?;
    sqlx::query(
        "UPDATE local_copies
         SET launch_count = CASE WHEN launch_count > 0 THEN launch_count - 1 ELSE 0 END
         WHERE id = ?",
    )
    .bind(local_copy_id)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;
    Ok(())
}

pub async fn recover_open_sessions(pool: &SqlitePool) -> Result<u64> {
    let now = format_timestamp(Utc::now());
    let result = sqlx::query(
        "UPDATE play_sessions
         SET status = 'ended', ended_at = last_heartbeat_at, end_reason = 'recovered',
             corrected = 0, updated_at = ?
         WHERE ended_at IS NULL",
    )
    .bind(now)
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

pub async fn close_open_sessions(pool: &SqlitePool) -> Result<u64> {
    let now = format_timestamp(Utc::now());
    let result = sqlx::query(
        "UPDATE play_sessions
         SET status = 'ended', ended_at = last_heartbeat_at, end_reason = 'app_closed',
             updated_at = ?
         WHERE ended_at IS NULL",
    )
    .bind(now)
    .execute(pool)
    .await?;
    Ok(result.rows_affected())
}

fn local_day_start(day: NaiveDate, now: DateTime<Local>) -> DateTime<Utc> {
    let naive = day.and_hms_opt(0, 0, 0).expect("midnight");
    match Local.from_local_datetime(&naive) {
        LocalResult::Single(value) => value.with_timezone(&Utc),
        LocalResult::Ambiguous(first, _) => first.with_timezone(&Utc),
        LocalResult::None => now.with_timezone(&Utc),
    }
}

fn period_start(period: StatsPeriod, now: DateTime<Local>) -> Option<DateTime<Utc>> {
    match period {
        StatsPeriod::Week => {
            let days = i64::from(now.weekday().num_days_from_monday());
            Some(local_day_start(
                now.date_naive() - ChronoDuration::days(days),
                now,
            ))
        }
        StatsPeriod::Month => Some(local_day_start(now.date_naive().with_day(1)?, now)),
        StatsPeriod::Year => {
            NaiveDate::from_ymd_opt(now.year(), 1, 1).map(|date| local_day_start(date, now))
        }
        StatsPeriod::All => None,
    }
}

async fn sum_since(pool: &SqlitePool, since: Option<DateTime<Utc>>) -> Result<(i64, i64)> {
    let row = if let Some(since) = since {
        sqlx::query(
            "SELECT COALESCE(SUM(duration_sec), 0) AS seconds, COUNT(*) AS sessions
             FROM play_sessions WHERE ended_at IS NOT NULL AND started_at >= ?",
        )
        .bind(format_timestamp(since))
        .fetch_one(pool)
        .await?
    } else {
        sqlx::query(
            "SELECT COALESCE(SUM(duration_sec), 0) AS seconds, COUNT(*) AS sessions
             FROM play_sessions WHERE ended_at IS NOT NULL",
        )
        .fetch_one(pool)
        .await?
    };
    Ok((row.try_get("seconds")?, row.try_get("sessions")?))
}

pub async fn stats_overview(pool: &SqlitePool, period: StatsPeriod) -> Result<StatsOverview> {
    let now = Local::now();
    let today = now.date_naive();
    let last7 = now.with_timezone(&Utc) - ChronoDuration::days(7);
    let previous7 = now.with_timezone(&Utc) - ChronoDuration::days(14);
    let last30 = now.with_timezone(&Utc) - ChronoDuration::days(30);
    let week_days = i64::from(now.weekday().num_days_from_monday());
    let current_week = local_day_start(today - ChronoDuration::days(week_days), now);
    let range_start = period_start(period, now);

    let totals = sqlx::query(
        "SELECT
           COALESCE(SUM(duration_sec), 0) AS all_time,
           COUNT(*) AS all_time_sessions,
           COALESCE(SUM(CASE WHEN started_at >= ? THEN duration_sec ELSE 0 END), 0) AS last7,
           COALESCE(SUM(CASE WHEN started_at >= ? AND started_at < ? THEN duration_sec ELSE 0 END), 0) AS previous7,
           COALESCE(SUM(CASE WHEN started_at >= ? THEN duration_sec ELSE 0 END), 0) AS last30
         FROM play_sessions WHERE ended_at IS NOT NULL",
    )
    .bind(format_timestamp(last7))
    .bind(format_timestamp(previous7))
    .bind(format_timestamp(last7))
    .bind(format_timestamp(last30))
    .fetch_one(pool)
    .await?;

    let week = sqlx::query(
        "SELECT COUNT(*) AS launches, COUNT(DISTINCT r.work_id) AS games
         FROM play_sessions ps
         JOIN local_copies lc ON lc.id = ps.local_copy_id
         JOIN releases r ON r.id = lc.release_id
         WHERE ps.ended_at IS NOT NULL AND ps.started_at >= ?",
    )
    .bind(format_timestamp(current_week))
    .fetch_one(pool)
    .await?;
    let (range_seconds, range_launches) = sum_since(pool, range_start).await?;

    let heatmap_start = local_day_start(today - ChronoDuration::days(83), now);
    let daily_rows = sqlx::query(
        "SELECT started_at, duration_sec FROM play_sessions
         WHERE ended_at IS NOT NULL AND started_at >= ?",
    )
    .bind(format_timestamp(heatmap_start))
    .fetch_all(pool)
    .await?;
    let mut daily_map = HashMap::<NaiveDate, i64>::new();
    for row in daily_rows {
        let started_at: String = row.try_get("started_at")?;
        let duration_sec: i64 = row.try_get("duration_sec")?;
        if let Ok(value) = DateTime::parse_from_rfc3339(&started_at) {
            *daily_map
                .entry(value.with_timezone(&Local).date_naive())
                .or_default() += duration_sec;
        }
    }
    let daily = (0..84)
        .map(|offset| {
            let date = today - ChronoDuration::days(83 - offset);
            DailyPlaytime {
                date: date.format("%Y-%m-%d").to_string(),
                seconds: *daily_map.get(&date).unwrap_or(&0),
            }
        })
        .collect();

    let top_sql = if range_start.is_some() {
        "SELECT w.id AS work_id, w.canonical_title AS title, w.original_title,
                COALESCE(SUM(ps.duration_sec), 0) AS seconds, COUNT(ps.id) AS session_count
         FROM play_sessions ps
         JOIN local_copies lc ON lc.id = ps.local_copy_id
         JOIN releases r ON r.id = lc.release_id
         JOIN works w ON w.id = r.work_id
         WHERE ps.ended_at IS NOT NULL AND ps.started_at >= ?
         GROUP BY w.id ORDER BY seconds DESC, w.id ASC LIMIT 5"
    } else {
        "SELECT w.id AS work_id, w.canonical_title AS title, w.original_title,
                COALESCE(SUM(ps.duration_sec), 0) AS seconds, COUNT(ps.id) AS session_count
         FROM play_sessions ps
         JOIN local_copies lc ON lc.id = ps.local_copy_id
         JOIN releases r ON r.id = lc.release_id
         JOIN works w ON w.id = r.work_id
         WHERE ps.ended_at IS NOT NULL
         GROUP BY w.id ORDER BY seconds DESC, w.id ASC LIMIT 5"
    };
    let mut top_query = sqlx::query(top_sql);
    if let Some(start) = range_start {
        top_query = top_query.bind(format_timestamp(start));
    }
    let top_rows = top_query.fetch_all(pool).await?;
    let top_games = top_rows
        .iter()
        .map(|row| {
            Ok(TopGame {
                work_id: row.try_get("work_id")?,
                title: row.try_get("title")?,
                original_title: row.try_get("original_title")?,
                seconds: row.try_get("seconds")?,
                session_count: row.try_get("session_count")?,
            })
        })
        .collect::<Result<Vec<_>>>()?;

    let recent_sql = if range_start.is_some() {
        format!(
            "{SESSION_SELECT} WHERE ps.ended_at IS NOT NULL AND ps.started_at >= ?
             ORDER BY ps.ended_at DESC LIMIT 20"
        )
    } else {
        format!(
            "{SESSION_SELECT} WHERE ps.ended_at IS NOT NULL
             ORDER BY ps.ended_at DESC LIMIT 20"
        )
    };
    let mut recent_query = sqlx::query(&recent_sql);
    if let Some(start) = range_start {
        recent_query = recent_query.bind(format_timestamp(start));
    }
    let recent_rows = recent_query.fetch_all(pool).await?;
    let recent_sessions = recent_rows
        .iter()
        .map(row_to_session)
        .collect::<Result<Vec<_>>>()?;

    Ok(StatsOverview {
        all_time_seconds: totals.try_get("all_time")?,
        all_time_sessions: totals.try_get("all_time_sessions")?,
        last7_seconds: totals.try_get("last7")?,
        last30_seconds: totals.try_get("last30")?,
        current_week_launches: week.try_get("launches")?,
        current_week_games: week.try_get("games")?,
        previous7_seconds: totals.try_get("previous7")?,
        range: period.as_str().to_string(),
        range_seconds,
        range_launches,
        daily,
        top_games,
        recent_sessions,
    })
}

#[cfg(test)]
mod tests {
    use chrono::{Duration as ChronoDuration, Utc};
    use tempfile::TempDir;

    use super::*;
    use crate::db::{self, LibraryQuery};

    async fn test_pool(temp: &TempDir) -> (SqlitePool, i64, i64) {
        let pool = db::open_pool(&temp.path().join("sessions.sqlite3"))
            .await
            .expect("pool");
        let work_id = sqlx::query("INSERT INTO works (canonical_title, original_title) VALUES ('月影工房', '月影のアトリエ')")
            .execute(&pool)
            .await
            .expect("work")
            .last_insert_rowid();
        let release_id = sqlx::query("INSERT INTO releases (work_id) VALUES (?)")
            .bind(work_id)
            .execute(&pool)
            .await
            .expect("release")
            .last_insert_rowid();
        let local_copy_id = sqlx::query(
            "INSERT INTO local_copies
               (release_id, root_path, exe_path, exe_key, working_dir, display_name)
             VALUES (?, 'C:\\Games', 'C:\\Games\\game.exe', 'c:\\games\\game.exe',
                     'C:\\Games', '月影工房')",
        )
        .bind(release_id)
        .execute(&pool)
        .await
        .expect("copy")
        .last_insert_rowid();
        (pool, work_id, local_copy_id)
    }

    fn old_range(hours: i64) -> (String, String) {
        let end = Utc::now() - ChronoDuration::minutes(5);
        let start = end - ChronoDuration::hours(hours);
        (format_timestamp(start), format_timestamp(end))
    }

    #[tokio::test]
    async fn records_heartbeats_and_updates_library_totals() {
        let temp = TempDir::new().expect("temp");
        let (pool, work_id, local_copy_id) = test_pool(&temp).await;

        let started = start_session(&pool, local_copy_id, "launch-1", 42, "C:\\Games\\game.exe")
            .await
            .expect("start");
        assert_eq!(started.session.status, "running");
        assert_eq!(started.session.work_id, work_id);
        heartbeat_session(&pool, started.session.id, "running", 120)
            .await
            .expect("heartbeat");
        let ended = finish_session(&pool, started.session.id, 135, "exited")
            .await
            .expect("finish")
            .expect("session");
        assert_eq!(ended.session.status, "ended");
        assert_eq!(ended.session.duration_sec, 135);
        assert_eq!(ended.session.end_reason.as_deref(), Some("exited"));

        let item = db::query_library(&pool, LibraryQuery::default())
            .await
            .expect("library")
            .items
            .remove(0);
        assert_eq!(item.playtime_minutes, 2);
        assert_eq!(item.playtime_seconds, 135);
        assert_eq!(item.launch_count, 1);

        let stats = stats_overview(&pool, StatsPeriod::All)
            .await
            .expect("stats");
        assert_eq!(stats.all_time_seconds, 135);
        assert_eq!(stats.all_time_sessions, 1);
        assert_eq!(stats.top_games[0].work_id, work_id);
    }

    #[tokio::test]
    async fn manual_sessions_can_be_created_corrected_and_deleted() {
        let temp = TempDir::new().expect("temp");
        let (pool, work_id, _) = test_pool(&temp).await;
        let (started_at, ended_at) = old_range(2);
        let created = create_manual_session(
            &pool,
            SessionCreateInput {
                work_id,
                started_at,
                ended_at,
                note: "补记二周目".to_string(),
            },
        )
        .await
        .expect("manual create");
        assert_eq!(created.session.duration_sec, 7200);
        assert_eq!(created.session.source, "manual");
        assert_eq!(created.session.note, "补记二周目");

        let (new_start, new_end) = old_range(3);
        let corrected = update_manual_session(
            &pool,
            created.session.id,
            SessionUpdateInput {
                started_at: new_start,
                ended_at: new_end,
                note: "修正为三小时".to_string(),
            },
        )
        .await
        .expect("manual update");
        assert_eq!(corrected.session.duration_sec, 10_800);
        assert!(corrected.session.corrected);

        delete_session(&pool, created.session.id)
            .await
            .expect("delete");
        assert!(
            list_work_sessions(&pool, work_id)
                .await
                .expect("list")
                .is_empty()
        );
    }

    #[tokio::test]
    async fn open_sessions_are_truncated_to_the_last_heartbeat_on_recovery() {
        let temp = TempDir::new().expect("temp");
        let (pool, _, local_copy_id) = test_pool(&temp).await;
        let started = start_session(
            &pool,
            local_copy_id,
            "launch-recover",
            7,
            "C:\\Games\\game.exe",
        )
        .await
        .expect("start");
        heartbeat_session(&pool, started.session.id, "paused", 45)
            .await
            .expect("heartbeat");
        assert_eq!(recover_open_sessions(&pool).await.expect("recover"), 1);
        let recovered = get_session_payload(&pool, started.session.id)
            .await
            .expect("read")
            .expect("session");
        assert_eq!(recovered.session.status, "ended");
        assert_eq!(recovered.session.end_reason.as_deref(), Some("recovered"));
        assert_eq!(recovered.session.duration_sec, 45);
        assert_eq!(
            recovered.session.ended_at,
            Some(recovered.session.last_heartbeat_at.clone())
        );
        assert_eq!(recover_open_sessions(&pool).await.expect("idempotent"), 0);
    }

    #[tokio::test]
    async fn clean_shutdown_marks_open_sessions_as_app_closed() {
        let temp = TempDir::new().expect("temp");
        let (pool, _, local_copy_id) = test_pool(&temp).await;
        let started = start_session(
            &pool,
            local_copy_id,
            "launch-close",
            8,
            "C:\\Games\\game.exe",
        )
        .await
        .expect("start");
        heartbeat_session(&pool, started.session.id, "running", 30)
            .await
            .expect("heartbeat");
        assert_eq!(close_open_sessions(&pool).await.expect("close"), 1);
        let closed = get_session_payload(&pool, started.session.id)
            .await
            .expect("read")
            .expect("session");
        assert_eq!(closed.session.end_reason.as_deref(), Some("app_closed"));
        assert_eq!(closed.session.duration_sec, 30);
    }

    #[tokio::test]
    async fn stats_query_handles_ten_thousand_sessions() {
        let temp = TempDir::new().expect("temp");
        let (pool, _, local_copy_id) = test_pool(&temp).await;
        let ended_at = format_timestamp(Utc::now() - ChronoDuration::minutes(1));
        let started_at = format_timestamp(Utc::now() - ChronoDuration::minutes(61));
        sqlx::query(
            "WITH RECURSIVE counter(value) AS (
               SELECT 1 UNION ALL SELECT value + 1 FROM counter WHERE value < 10000
             )
             INSERT INTO play_sessions
               (local_copy_id, launch_id, status, started_at, last_heartbeat_at, ended_at,
                duration_sec, end_reason, source)
             SELECT ?, 'bulk-' || value, 'ended', ?, ?, ?, 600, 'exited', 'manual'
             FROM counter",
        )
        .bind(local_copy_id)
        .bind(&started_at)
        .bind(&ended_at)
        .bind(&ended_at)
        .execute(&pool)
        .await
        .expect("bulk sessions");
        let stats = stats_overview(&pool, StatsPeriod::All)
            .await
            .expect("stats");
        assert_eq!(stats.all_time_sessions, 10_000);
        assert_eq!(stats.all_time_seconds, 6_000_000);
        assert_eq!(stats.recent_sessions.len(), 20);
    }

    #[tokio::test]
    async fn stats_period_filters_old_sessions() {
        let temp = TempDir::new().expect("temp");
        let (pool, work_id, _) = test_pool(&temp).await;
        let now = Utc::now();
        create_manual_session(
            &pool,
            SessionCreateInput {
                work_id,
                started_at: format_timestamp(
                    now - ChronoDuration::days(200) - ChronoDuration::hours(2),
                ),
                ended_at: format_timestamp(now - ChronoDuration::days(200)),
                note: String::new(),
            },
        )
        .await
        .expect("old session");
        create_manual_session(
            &pool,
            SessionCreateInput {
                work_id,
                started_at: format_timestamp(now - ChronoDuration::hours(2)),
                ended_at: format_timestamp(now - ChronoDuration::minutes(5)),
                note: String::new(),
            },
        )
        .await
        .expect("recent session");

        assert_eq!(
            stats_overview(&pool, StatsPeriod::Week)
                .await
                .expect("week")
                .range_launches,
            1
        );
        assert_eq!(
            stats_overview(&pool, StatsPeriod::Month)
                .await
                .expect("month")
                .range_launches,
            1
        );
        assert_eq!(
            stats_overview(&pool, StatsPeriod::Year)
                .await
                .expect("year")
                .range_launches,
            2
        );
        assert_eq!(
            stats_overview(&pool, StatsPeriod::All)
                .await
                .expect("all")
                .range_launches,
            2
        );
    }

    #[test]
    fn manual_ranges_reject_invalid_order() {
        let now = Utc::now();
        let start = format_timestamp(now);
        let end = format_timestamp(now - ChronoDuration::minutes(1));
        assert!(normalized_range(&start, &end).is_err());
    }
}
