PRAGMA foreign_keys = ON;

ALTER TABLE works ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE local_copies ADD COLUMN last_launched_at TEXT;
ALTER TABLE local_copies ADD COLUMN launch_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'cover' CHECK (kind IN ('cover', 'banner')),
  original_path TEXT NOT NULL,
  thumb_path TEXT NOT NULL,
  source_path TEXT,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'local', 'online')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (work_id, kind)
);

CREATE TABLE launch_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_copy_id INTEGER NOT NULL UNIQUE REFERENCES local_copies(id) ON DELETE CASCADE,
  args_json TEXT NOT NULL DEFAULT '[]',
  env_json TEXT NOT NULL DEFAULT '[]',
  wrapper_path TEXT,
  wrapper_args_json TEXT NOT NULL DEFAULT '[]',
  monitor INTEGER,
  fullscreen INTEGER NOT NULL DEFAULT 0 CHECK (fullscreen IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_assets_work_kind ON assets (work_id, kind);
CREATE INDEX idx_launch_profiles_local_copy ON launch_profiles (local_copy_id);
