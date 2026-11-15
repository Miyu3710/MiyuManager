PRAGMA foreign_keys = ON;

CREATE TABLE metadata_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO metadata_providers (id, name, description, priority)
VALUES
  ('vndb', 'VNDB', '原题、别名、开发商、标签和关联作品', 10),
  ('bangumi', 'Bangumi', '中文标题、简介、发行日期和中文标签', 20);

CREATE TABLE source_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  record_key TEXT NOT NULL UNIQUE,
  source_id TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'detail' CHECK (kind IN ('search', 'detail')),
  raw_json TEXT NOT NULL,
  etag TEXT,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT
);

CREATE INDEX idx_source_records_provider ON source_records (provider, kind);
CREATE INDEX idx_source_records_source_id ON source_records (provider, source_id);

CREATE TABLE metadata_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL DEFAULT '',
  value_json TEXT NOT NULL,
  confidence REAL,
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (work_id, field, source, source_id)
);

CREATE INDEX idx_metadata_claims_work_field ON metadata_claims (work_id, field);
CREATE INDEX idx_metadata_claims_locked ON metadata_claims (work_id, locked);
