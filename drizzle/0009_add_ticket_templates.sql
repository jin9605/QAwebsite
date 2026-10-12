CREATE TABLE IF NOT EXISTS ticket_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ticket_templates_user_updated ON ticket_templates(user_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_templates_one_default ON ticket_templates(user_id) WHERE is_default=1;
