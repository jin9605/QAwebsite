ALTER TABLE tickets ADD COLUMN project_id TEXT;
CREATE INDEX IF NOT EXISTS idx_tickets_project_id ON tickets(project_id);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  start_date TEXT,
  due_at TEXT NOT NULL,
  owner TEXT,
  status TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_due_at ON projects(due_at);
