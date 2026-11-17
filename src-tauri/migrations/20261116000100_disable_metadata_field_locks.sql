-- Field locking was removed. The column is kept for schema compatibility,
-- but all existing locks are cleared and no code reads or writes it.
UPDATE metadata_claims SET locked = 0;
