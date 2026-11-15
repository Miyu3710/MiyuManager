PRAGMA foreign_keys = ON;

CREATE TABLE metadata_field_priorities (
  field TEXT NOT NULL,
  provider TEXT NOT NULL,
  rank INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (field, provider)
);

CREATE INDEX idx_metadata_field_priorities_field
  ON metadata_field_priorities (field, rank);
