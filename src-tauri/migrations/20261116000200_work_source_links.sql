CREATE TABLE work_source_links (
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  source_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (work_id, provider)
);

CREATE INDEX idx_work_source_links_work ON work_source_links (work_id);
