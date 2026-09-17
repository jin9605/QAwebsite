import { env } from "cloudflare:workers";
const json = (data: unknown, status = 200) => Response.json(data, { status });
let schemaReady: Promise<void> | undefined;
const ensureGameColumn = () => schemaReady ||= env.DB.prepare(`ALTER TABLE tickets ADD COLUMN game TEXT`).run().then(() => undefined).catch(error => { if (!String(error).includes("duplicate column name")) throw error; });
export async function GET() { await ensureGameColumn(); const { results } = await env.DB.prepare(`SELECT id,title,status,severity,game,created_at,updated_at FROM tickets ORDER BY updated_at DESC`).all(); return json({ tickets: results }); }
export async function POST(request: Request) {
  await ensureGameColumn(); const body = await request.json() as Record<string, string>; const title = (body.title || "").trim();
  if (!title || title.length > 50) return json({ error: "제목은 1~50자로 입력해 주세요." }, 400);
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO tickets (id,title,status,severity,game,environment,frequency,reproduction,content,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(id,title,body.status||"신규",body.severity||"Major",(body.game||"").trim(),body.environment||"",body.frequency||"항상",body.reproduction||"",body.content||"",now,now).run();
  return json({ id }, 201);
}
