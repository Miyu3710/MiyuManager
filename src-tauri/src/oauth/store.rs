use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Result;
use sqlx::{Row, SqlitePool};

use super::crypto;
use super::types::{AccountInfo, OAuthAccountRow, TokenResponse};

#[derive(Debug, Clone)]
pub struct StoredTokens {
    pub access_token_enc: Vec<u8>,
    pub refresh_token_enc: Option<Vec<u8>>,
    pub expires_at: i64,
}

pub async fn save_account(
    pool: &SqlitePool,
    provider: &str,
    tokens: &TokenResponse,
    account: &AccountInfo,
    scopes: &[String],
) -> Result<()> {
    let access_encrypted = crypto::protect(tokens.access_token.as_bytes())?;
    let refresh_encrypted = tokens
        .refresh_token
        .as_deref()
        .map(|token| crypto::protect(token.as_bytes()))
        .transpose()?;
    let expires_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
        + tokens.expires_in_seconds();
    let scopes_json = serde_json::to_string(scopes)?;
    sqlx::query(
        "INSERT INTO oauth_accounts
           (provider, account_name, account_id, avatar_url, scopes_json, access_token_enc,
            refresh_token_enc, expires_at, connected_at, profile_synced_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(provider) DO UPDATE SET
           account_name = excluded.account_name,
           account_id = excluded.account_id,
           avatar_url = excluded.avatar_url,
           scopes_json = excluded.scopes_json,
           access_token_enc = excluded.access_token_enc,
           refresh_token_enc = excluded.refresh_token_enc,
           expires_at = excluded.expires_at,
           connected_at = excluded.connected_at,
           profile_synced_at = excluded.profile_synced_at,
           updated_at = excluded.updated_at",
    )
    .bind(provider)
    .bind(account.name.as_deref())
    .bind(account.id.as_deref())
    .bind(account.avatar_url.as_deref())
    .bind(scopes_json)
    .bind(access_encrypted)
    .bind(refresh_encrypted)
    .bind(expires_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_accounts(pool: &SqlitePool) -> Result<Vec<OAuthAccountRow>> {
    let rows = sqlx::query(
        "SELECT provider, account_name, account_id, avatar_url, profile_synced_at,
                connected_at, scopes_json, expires_at
         FROM oauth_accounts ORDER BY provider ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| OAuthAccountRow {
            provider: row.get("provider"),
            account_name: row.get("account_name"),
            account_id: row.get("account_id"),
            avatar_url: row.get("avatar_url"),
            profile_synced_at: row.get("profile_synced_at"),
            connected_at: row.get("connected_at"),
            scopes: serde_json::from_str::<Vec<String>>(&row.get::<String, _>("scopes_json"))
                .unwrap_or_default(),
            expires_at: row.get("expires_at"),
        })
        .collect())
}

pub async fn load_tokens(pool: &SqlitePool, provider: &str) -> Result<Option<StoredTokens>> {
    let row = sqlx::query(
        "SELECT access_token_enc, refresh_token_enc, expires_at
         FROM oauth_accounts WHERE provider = ?",
    )
    .bind(provider)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|row| StoredTokens {
        access_token_enc: row.get("access_token_enc"),
        refresh_token_enc: row.get("refresh_token_enc"),
        expires_at: row.get("expires_at"),
    }))
}

pub async fn update_tokens(
    pool: &SqlitePool,
    provider: &str,
    tokens: &TokenResponse,
    scopes: &[String],
) -> Result<()> {
    let access_encrypted = crypto::protect(tokens.access_token.as_bytes())?;
    let refresh_encrypted = tokens
        .refresh_token
        .as_deref()
        .map(|token| crypto::protect(token.as_bytes()))
        .transpose()?;
    let expires_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
        + tokens.expires_in_seconds();
    let result = sqlx::query(
        "UPDATE oauth_accounts SET
           scopes_json = ?,
           access_token_enc = ?,
           refresh_token_enc = COALESCE(?, refresh_token_enc),
           expires_at = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE provider = ?",
    )
    .bind(serde_json::to_string(scopes)?)
    .bind(access_encrypted)
    .bind(refresh_encrypted)
    .bind(expires_at)
    .bind(provider)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        anyhow::bail!("账号不存在");
    }
    Ok(())
}

pub async fn delete_account(pool: &SqlitePool, provider: &str) -> Result<()> {
    sqlx::query("DELETE FROM oauth_accounts WHERE provider = ?")
        .bind(provider)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn update_profile(
    pool: &SqlitePool,
    provider: &str,
    account: &AccountInfo,
) -> Result<()> {
    let result = sqlx::query(
        "UPDATE oauth_accounts SET
           account_name = COALESCE(?, account_name),
           account_id = COALESCE(?, account_id),
           avatar_url = COALESCE(?, avatar_url),
           profile_synced_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE provider = ?",
    )
    .bind(account.name.as_deref())
    .bind(account.id.as_deref())
    .bind(account.avatar_url.as_deref())
    .bind(provider)
    .execute(pool)
    .await?;
    if result.rows_affected() == 0 {
        anyhow::bail!("账号不存在");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn saves_syncs_and_removes_account_profile() {
        let pool = crate::db::open_memory_pool().await.expect("pool");
        let tokens = TokenResponse {
            access_token: "access-token".to_string(),
            refresh_token: None,
            expires_in: Some(serde_json::json!(3600)),
            id_token: None,
            user_id: None,
        };
        let account = AccountInfo {
            name: Some("miyu".to_string()),
            id: Some("42".to_string()),
            avatar_url: Some("https://img.example/miyu.png".to_string()),
        };
        save_account(&pool, "bangumi", &tokens, &account, &["openid".to_string()])
            .await
            .expect("save account");

        let rows = list_accounts(&pool).await.expect("accounts");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].account_name.as_deref(), Some("miyu"));
        assert_eq!(
            rows[0].avatar_url.as_deref(),
            Some("https://img.example/miyu.png")
        );
        assert!(rows[0].profile_synced_at.is_some());

        update_profile(
            &pool,
            "bangumi",
            &AccountInfo {
                name: Some("Miyu".to_string()),
                id: None,
                avatar_url: None,
            },
        )
        .await
        .expect("update profile");
        let rows = list_accounts(&pool).await.expect("accounts");
        assert_eq!(rows[0].account_name.as_deref(), Some("Miyu"));
        assert_eq!(rows[0].account_id.as_deref(), Some("42"));
        assert_eq!(
            rows[0].avatar_url.as_deref(),
            Some("https://img.example/miyu.png")
        );

        delete_account(&pool, "bangumi")
            .await
            .expect("delete account");
        assert!(list_accounts(&pool).await.expect("accounts").is_empty());
    }
}
