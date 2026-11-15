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
           (provider, account_name, account_id, scopes_json, access_token_enc,
            refresh_token_enc, expires_at, connected_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(provider) DO UPDATE SET
           account_name = excluded.account_name,
           account_id = excluded.account_id,
           scopes_json = excluded.scopes_json,
           access_token_enc = excluded.access_token_enc,
           refresh_token_enc = excluded.refresh_token_enc,
           expires_at = excluded.expires_at,
           connected_at = excluded.connected_at,
           updated_at = excluded.updated_at",
    )
    .bind(provider)
    .bind(account.name.as_deref())
    .bind(account.id.as_deref())
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
        "SELECT provider, account_name, account_id, scopes_json, expires_at
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
