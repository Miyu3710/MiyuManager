PRAGMA foreign_keys = ON;

CREATE TABLE oauth_accounts (
  provider TEXT PRIMARY KEY,
  account_name TEXT,
  account_id TEXT,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  access_token_enc BLOB,
  refresh_token_enc BLOB,
  expires_at INTEGER,
  connected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
