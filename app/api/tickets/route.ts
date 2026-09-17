import { env } from "cloudflare:workers";
const json = (data: unknown, status = 200) => Response.json(data, { status });
async function init() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL, severity TEXT NOT NULL, environment TEXT, frequency TEXT, reproduction TEXT, content TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, name TEXT NOT NULL, content_type TEXT, size INTEGER, description TEXT, object_key TEXT NOT NULL, created_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at DESC)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_attachments_ticket_id ON attachments(ticket_id)`),
    env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_comments_ticket_id ON comments(ticket_id, created_at)`),
  ]);
}
export async function GET() { await init(); const { results } = await env.DB.prepare(`SELECT id,title,status,severity,created_at,updated_at FROM tickets ORDER BY updated_at DESC`).all(); return json({ tickets: results }); }
export async function POST(request: Request) {
  await init(); const body = await request.json() as Record<string, string>; const title = (body.title || "").trim();
  if (!title || title.length > 50) return json({ error: "제목은 1~50자로 입력해 주세요." }, 400);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO tickets (id,title,status,severity,environment,frequency,reproduction,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,title,body.status||"신규",body.severity||"Major",body.environment||"",body.frequency||"항상",body.reproduction||"",body.content||"",now,now).run();
  return json({ id }, 201);
}
