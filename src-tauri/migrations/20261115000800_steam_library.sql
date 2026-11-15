PRAGMA foreign_keys = ON;

ALTER TABLE local_copies ADD COLUMN steam_app_id INTEGER;

CREATE INDEX idx_local_copies_steam_app_id ON local_copies (steam_app_id);
