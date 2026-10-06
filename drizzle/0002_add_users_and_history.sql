CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ticket_history (
  id TEXT PRIMARY KEY,
  ticket_id TEXT,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);
ALTER TABLE tickets ADD COLUMN created_by_id TEXT;
ALTER TABLE tickets ADD COLUMN created_by_name TEXT;
ALTER TABLE tickets ADD COLUMN updated_by_id TEXT;
ALTER TABLE tickets ADD COLUMN updated_by_name TEXT;
ALTER TABLE tickets ADD COLUMN deleted_at TEXT;
ALTER TABLE tickets ADD COLUMN deleted_by_id TEXT;
ALTER TABLE tickets ADD COLUMN deleted_by_name TEXT;
CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket_id ON ticket_history(ticket_id, created_at DESC);
