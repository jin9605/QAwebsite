CREATE TABLE IF NOT EXISTS planning_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  project_id TEXT,
  code TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  development_status TEXT,
  qa_status TEXT,
  tags TEXT NOT NULL DEFAULT '',
  linked_document_ids TEXT NOT NULL DEFAULT '[]',
  linked_ticket_ids TEXT NOT NULL DEFAULT '[]',
  created_by_id TEXT NOT NULL,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_planning_items_kind_project_updated ON planning_items(kind, project_id, updated_at DESC);
