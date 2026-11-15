PRAGMA foreign_keys = ON;

CREATE TABLE play_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_copy_id INTEGER NOT NULL REFERENCES local_copies(id) ON DELETE CASCADE,
  launch_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'ended')),
  started_at TEXT NOT NULL,
  last_heartbeat_at TEXT NOT NULL,
  ended_at TEXT,
  duration_sec INTEGER NOT NULL DEFAULT 0 CHECK (duration_sec >= 0),
  end_reason TEXT,
  source TEXT NOT NULL DEFAULT 'launcher' CHECK (source IN ('launcher', 'manual')),
  process_id INTEGER,
  exe_path TEXT,
  note TEXT NOT NULL DEFAULT '',
  corrected INTEGER NOT NULL DEFAULT 0 CHECK (corrected IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX idx_play_sessions_open_copy
  ON play_sessions(local_copy_id)
  WHERE ended_at IS NULL;
CREATE INDEX idx_play_sessions_copy_started
  ON play_sessions(local_copy_id, started_at DESC);
CREATE INDEX idx_play_sessions_started
  ON play_sessions(started_at DESC);
CREATE INDEX idx_play_sessions_open_heartbeat
  ON play_sessions(ended_at, last_heartbeat_at);
