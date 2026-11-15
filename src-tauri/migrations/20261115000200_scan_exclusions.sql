CREATE TABLE scan_exclusions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exe_key TEXT NOT NULL UNIQUE,
  exe_path TEXT NOT NULL,
  dir_key TEXT NOT NULL,
  working_dir TEXT NOT NULL,
  root_path TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'removed_from_library',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_scan_exclusions_dir_key ON scan_exclusions (dir_key);
