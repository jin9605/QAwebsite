import { env } from "cloudflare:workers";

let schemaReady: Promise<void> | undefined;
let legacyProjectsReady: Promise<void> | undefined;

export const ensureTicketSchema = () => schemaReady ||= env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, severity TEXT NOT NULL, game TEXT, project_id TEXT, ticket_number INTEGER, assignee TEXT, due_at TEXT, environment TEXT, frequency TEXT, reproduction TEXT, content TEXT, created_by_id TEXT, created_by_name TEXT, updated_by_id TEXT, updated_by_name TEXT, deleted_at TEXT, deleted_by_id TEXT, deleted_by_name TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, ticket_name TEXT UNIQUE, start_date TEXT, due_at TEXT NOT NULL, owner TEXT, status TEXT NOT NULL, created_by_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS project_members (project_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, added_by_id TEXT, created_at TEXT NOT NULL, PRIMARY KEY (project_id,user_id))`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, name TEXT NOT NULL, content_type TEXT, size INTEGER, description TEXT, object_key TEXT NOT NULL, created_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, author TEXT NOT NULL, created_by_id TEXT, body TEXT NOT NULL, created_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at DESC)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_projects_due_at ON projects(due_at)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_attachments_ticket_id ON attachments(ticket_id)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id, created_at)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', password_hash TEXT, password_salt TEXT, last_login_at TEXT, created_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS login_history (id TEXT PRIMARY KEY, user_id TEXT, email TEXT NOT NULL, success INTEGER NOT NULL, created_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS ticket_history (id TEXT PRIMARY KEY, ticket_id TEXT, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL, action TEXT NOT NULL, before_json TEXT, after_json TEXT, created_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_id TEXT, actor_name TEXT, action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT, outcome TEXT NOT NULL, reason TEXT, ip_address TEXT, user_agent TEXT, metadata_json TEXT, created_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS planning_documents (id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, project_id TEXT, version TEXT, tags TEXT NOT NULL DEFAULT '', source_file_name TEXT NOT NULL, text_content TEXT NOT NULL, object_key TEXT NOT NULL, size INTEGER NOT NULL, created_by_id TEXT NOT NULL, created_by_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS planning_items (id TEXT PRIMARY KEY, kind TEXT NOT NULL, project_id TEXT, code TEXT, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, development_status TEXT, qa_status TEXT, tags TEXT NOT NULL DEFAULT '', linked_document_ids TEXT NOT NULL DEFAULT '[]', linked_ticket_ids TEXT NOT NULL DEFAULT '[]', created_by_id TEXT NOT NULL, created_by_name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS project_plans (project_id TEXT PRIMARY KEY, concept TEXT NOT NULL DEFAULT '', target_users TEXT NOT NULL DEFAULT '', release_scope TEXT NOT NULL DEFAULT '', success_criteria TEXT NOT NULL DEFAULT '', stages_json TEXT NOT NULL DEFAULT '[]', updated_by_id TEXT NOT NULL, updated_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_ticket_history_ticket_id ON ticket_history(ticket_id, created_at DESC)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON project_members(user_id,project_id)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_planning_documents_project_updated ON planning_documents(project_id,updated_at DESC)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_planning_documents_category_updated ON planning_documents(category,updated_at DESC)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_planning_items_kind_project_updated ON planning_items(kind,project_id,updated_at DESC)`),
]).then(async () => {
  const addColumn = async (column: string) => { try { await env.DB.prepare(`ALTER TABLE tickets ADD COLUMN ${column}`).run(); } catch (error) { if (!String(error).includes("duplicate column name")) throw error; } };
  await addColumn("game TEXT");
  await addColumn("project_id TEXT");
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tickets_project_id ON tickets(project_id)").run();
  await addColumn("assignee TEXT");
  await addColumn("due_at TEXT");
  await addColumn("created_by_id TEXT");
  await addColumn("created_by_name TEXT");
  await addColumn("updated_by_id TEXT");
  await addColumn("updated_by_name TEXT");
  await addColumn("deleted_at TEXT");
  await addColumn("deleted_by_id TEXT");
  await addColumn("deleted_by_name TEXT");
  await addColumn("assignee_id TEXT");
  await addColumn("issue_reason TEXT");
  await addColumn("ticket_number INTEGER");
  try { await env.DB.prepare("ALTER TABLE projects ADD COLUMN ticket_name TEXT").run(); } catch (error) { if (!String(error).includes("duplicate column name")) throw error; }
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_ticket_name ON projects(ticket_name) WHERE ticket_name IS NOT NULL").run();
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_project_ticket_number ON tickets(project_id,ticket_number) WHERE ticket_number IS NOT NULL").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tickets_active_updated ON tickets(deleted_at,updated_at DESC,id DESC)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tickets_project_updated ON tickets(project_id,deleted_at,updated_at DESC)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tickets_assignee_updated ON tickets(assignee_id,deleted_at,updated_at DESC)").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_tickets_status_due ON tickets(status,due_at)").run();
  try { await env.DB.prepare("ALTER TABLE comments ADD COLUMN created_by_id TEXT").run(); } catch (error) { if (!String(error).includes("duplicate column name")) throw error; }
  try { await env.DB.prepare("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'").run(); } catch (error) { if (!String(error).includes("duplicate column name")) throw error; }
  try { await env.DB.prepare("ALTER TABLE users ADD COLUMN password_hash TEXT").run(); } catch (error) { if (!String(error).includes("duplicate column name")) throw error; }
  try { await env.DB.prepare("ALTER TABLE users ADD COLUMN password_salt TEXT").run(); } catch (error) { if (!String(error).includes("duplicate column name")) throw error; }
  try { await env.DB.prepare("ALTER TABLE users ADD COLUMN last_login_at TEXT").run(); } catch (error) { if (!String(error).includes("duplicate column name")) throw error; }
  try { await env.DB.prepare("ALTER TABLE login_history ADD COLUMN ip_address TEXT").run(); } catch (error) { if (!String(error).includes("duplicate column name")) throw error; }
  try { await env.DB.prepare("ALTER TABLE login_history ADD COLUMN user_agent TEXT").run(); } catch (error) { if (!String(error).includes("duplicate column name")) throw error; }
  try { await env.DB.prepare("ALTER TABLE login_history ADD COLUMN reason TEXT").run(); } catch (error) { if (!String(error).includes("duplicate column name")) throw error; }
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_login_history_email_created ON login_history(email,created_at DESC)").run();
  await env.DB.prepare("UPDATE tickets SET assignee_id=(SELECT users.id FROM users WHERE users.name=tickets.assignee AND users.status='approved' LIMIT 1) WHERE assignee_id IS NULL AND assignee IS NOT NULL AND TRIM(assignee)<>'' AND (SELECT COUNT(*) FROM users WHERE users.name=tickets.assignee AND users.status='approved')=1").run();
  await env.DB.prepare("UPDATE tickets SET assignee=NULL WHERE assignee_id IS NULL AND assignee IS NOT NULL AND TRIM(assignee)<>''").run();
  await env.DB.prepare("INSERT OR IGNORE INTO project_members (project_id,user_id,role,added_by_id,created_at) SELECT projects.id,projects.created_by_id,'project_admin',projects.created_by_id,projects.created_at FROM projects JOIN users ON users.id=projects.created_by_id WHERE projects.created_by_id<>'legacy'").run();
  await env.DB.prepare("INSERT OR IGNORE INTO project_members (project_id,user_id,role,added_by_id,created_at) SELECT tickets.project_id,tickets.created_by_id,'qa',tickets.created_by_id,tickets.created_at FROM tickets JOIN users ON users.id=tickets.created_by_id WHERE tickets.project_id IS NOT NULL AND tickets.created_by_id IS NOT NULL").run();
  await env.DB.prepare("INSERT OR IGNORE INTO project_members (project_id,user_id,role,added_by_id,created_at) SELECT tickets.project_id,tickets.assignee_id,'developer',tickets.created_by_id,tickets.created_at FROM tickets JOIN users ON users.id=tickets.assignee_id WHERE tickets.project_id IS NOT NULL AND tickets.assignee_id IS NOT NULL").run();
});

export const syncLegacyProjects = () => legacyProjectsReady ||= syncLegacyProjectsOnce();

async function syncLegacyProjectsOnce() {
  await ensureTicketSchema();
  const legacyGames = await env.DB.prepare("SELECT DISTINCT game FROM tickets WHERE project_id IS NULL AND game IS NOT NULL AND TRIM(game) <> ''").all<{ game: string }>();
  const now = new Date().toISOString();
  if (legacyGames.results.length) {
    await env.DB.batch(legacyGames.results.map(({ game }) => env.DB.prepare("INSERT OR IGNORE INTO projects (id,name,start_date,due_at,owner,status,created_by_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), game.trim(), null, "", "", "준비", "legacy", now, now)));
    await env.DB.prepare("UPDATE tickets SET project_id=(SELECT id FROM projects WHERE projects.name=tickets.game) WHERE project_id IS NULL AND game IS NOT NULL AND TRIM(game) <> ''").run();
    await env.DB.prepare("INSERT OR IGNORE INTO project_members (project_id,user_id,role,added_by_id,created_at) SELECT tickets.project_id,tickets.created_by_id,'qa',tickets.created_by_id,tickets.created_at FROM tickets JOIN users ON users.id=tickets.created_by_id WHERE tickets.project_id IS NOT NULL AND tickets.created_by_id IS NOT NULL").run();
    await env.DB.prepare("INSERT OR IGNORE INTO project_members (project_id,user_id,role,added_by_id,created_at) SELECT tickets.project_id,tickets.assignee_id,'developer',tickets.created_by_id,tickets.created_at FROM tickets JOIN users ON users.id=tickets.assignee_id WHERE tickets.project_id IS NOT NULL AND tickets.assignee_id IS NOT NULL").run();
  }
}
