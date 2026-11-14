PRAGMA foreign_keys = ON;

CREATE TABLE scan_roots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  path_key TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  last_scanned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_title TEXT NOT NULL,
  original_title TEXT NOT NULL DEFAULT '',
  aliases_json TEXT NOT NULL DEFAULT '[]',
  description TEXT NOT NULL DEFAULT '',
  release_year INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'Windows',
  language TEXT,
  release_date TEXT,
  developer TEXT,
  publisher TEXT,
  edition TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE local_copies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  root_id INTEGER REFERENCES scan_roots(id) ON DELETE SET NULL,
  root_path TEXT NOT NULL,
  exe_path TEXT NOT NULL,
  exe_key TEXT NOT NULL UNIQUE,
  working_dir TEXT NOT NULL,
  display_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  install_status TEXT NOT NULL DEFAULT 'installed' CHECK (install_status IN ('installed', 'missing')),
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE user_entries (
  work_id INTEGER PRIMARY KEY REFERENCES works(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'unclassified' CHECK (status IN ('unclassified', 'playing', 'queued', 'finished', 'paused')),
  rating REAL,
  favorite INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE INDEX idx_releases_work_id ON releases (work_id);
CREATE INDEX idx_local_copies_release_id ON local_copies (release_id);
CREATE INDEX idx_local_copies_root_id ON local_copies (root_id);
CREATE INDEX idx_local_copies_created_at ON local_copies (created_at DESC);
CREATE INDEX idx_local_copies_size_bytes ON local_copies (size_bytes DESC);
CREATE INDEX idx_user_entries_status ON user_entries (status);
CREATE INDEX idx_works_title ON works (canonical_title COLLATE NOCASE);

CREATE VIRTUAL TABLE works_fts USING fts5(
  canonical_title,
  original_title,
  aliases_json,
  content = 'works',
  content_rowid = 'id',
  tokenize = 'trigram'
);

CREATE TRIGGER works_ai AFTER INSERT ON works BEGIN
  INSERT INTO works_fts(rowid, canonical_title, original_title, aliases_json)
  VALUES (new.id, new.canonical_title, new.original_title, new.aliases_json);
END;

CREATE TRIGGER works_ad AFTER DELETE ON works BEGIN
  INSERT INTO works_fts(works_fts, rowid, canonical_title, original_title, aliases_json)
  VALUES ('delete', old.id, old.canonical_title, old.original_title, old.aliases_json);
END;

CREATE TRIGGER works_au AFTER UPDATE ON works BEGIN
  INSERT INTO works_fts(works_fts, rowid, canonical_title, original_title, aliases_json)
  VALUES ('delete', old.id, old.canonical_title, old.original_title, old.aliases_json);
  INSERT INTO works_fts(rowid, canonical_title, original_title, aliases_json)
  VALUES (new.id, new.canonical_title, new.original_title, new.aliases_json);
END;
