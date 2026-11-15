PRAGMA foreign_keys = ON;

CREATE TABLE collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE collection_items (
  collection_id INTEGER NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (collection_id, work_id)
);

CREATE INDEX idx_collections_sort ON collections (sort_order, id);
CREATE INDEX idx_collection_items_work ON collection_items (work_id);
