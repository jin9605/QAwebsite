import { env } from "cloudflare:workers";
const json = (data: unknown, status = 200) => Response.json(data, { status });
let schemaReady: Promise<void> | undefined;
const ensureGameColumn = () => schemaReady ||= env.DB.prepare(`ALTER TABLE tickets ADD COLUMN game TEXT`).run().then(() => undefined).catch(error => { if (!String(error).includes("duplicate column name")) throw error; });
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureGameColumn(); const { id } = await params; const ticket = await env.DB.prepare(`SELECT * FROM tickets WHERE id=?`).bind(id).first(); if (!ticket) return json({ error: "티켓을 찾을 수 없습니다." }, 404);
  const attachments = await env.DB.prepare(`SELECT id,name,content_type,size,description,created_at FROM attachments WHERE ticket_id=? ORDER BY created_at`).bind(id).all();
  const comments = await env.DB.prepare(`SELECT * FROM comments WHERE ticket_id=? ORDER BY created_at`).bind(id).all(); return json({ ticket, attachments: attachments.results, comments: comments.results });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureGameColumn(); const { id } = await params; const body = await request.json() as Record<string,string>; const now = new Date().toISOString();
  const result = await env.DB.prepare(`UPDATE tickets SET title=?,status=?,severity=?,game=?,environment=?,frequency=?,reproduction=?,content=?,updated_at=? WHERE id=?`).bind((body.title||"").slice(0,50),body.status||"신규",body.severity||"Major",(body.game||"").trim(),body.environment||"",body.frequency||"항상",body.reproduction||"",body.content||"",now,id).run();
  if (!result.meta.changes) return json({ error: "티켓을 찾을 수 없습니다." }, 404); return json({ ok:true, updated_at:now });
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureGameColumn(); const { id } = await params; const files = await env.DB.prepare(`SELECT object_key FROM attachments WHERE ticket_id=?`).bind(id).all<{object_key:string}>(); await Promise.all(files.results.map(f=>env.BUCKET.delete(f.object_key)));
  await env.DB.batch([env.DB.prepare(`DELETE FROM comments WHERE ticket_id=?`).bind(id),env.DB.prepare(`DELETE FROM attachments WHERE ticket_id=?`).bind(id),env.DB.prepare(`DELETE FROM tickets WHERE id=?`).bind(id)]); return json({ ok:true });
}
