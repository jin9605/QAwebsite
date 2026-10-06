CREATE TABLE IF NOT EXISTS project_plans (
  project_id TEXT PRIMARY KEY,
  concept TEXT NOT NULL DEFAULT '',
  target_users TEXT NOT NULL DEFAULT '',
  release_scope TEXT NOT NULL DEFAULT '',
  success_criteria TEXT NOT NULL DEFAULT '',
  stages_json TEXT NOT NULL DEFAULT '[]',
  updated_by_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
