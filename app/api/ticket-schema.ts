import { env } from "cloudflare:workers";

let schemaReady: Promise<void> | undefined;

export const ensureTicketSchema = () => schemaReady ||= env.DB.batch([
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, severity TEXT NOT NULL, environment TEXT, frequency TEXT, reproduction TEXT, content TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, name TEXT NOT NULL, content_type TEXT, size INTEGER, description TEXT, object_key TEXT NOT NULL, created_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at DESC)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_attachments_ticket_id ON attachments(ticket_id)`),
  env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id, created_at)`),
]).then(async () => {
  try { await env.DB.prepare(`ALTER TABLE tickets ADD COLUMN game TEXT`).run(); } catch (error) { if (!String(error).includes("duplicate column name")) throw error; }
});
