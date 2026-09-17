import { env } from "cloudflare:workers";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ticketId } = await params; const body = await request.json() as { author?: string; body?: string };
  const author = (body.author || "").trim(), text = (body.body || "").trim();
  if (!author || !text) return Response.json({ error: "작성자와 댓글 내용을 입력해 주세요." }, { status: 400 });
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.batch([env.DB.prepare(`INSERT INTO comments (id,ticket_id,author,body,created_at) VALUES (?,?,?,?,?)`).bind(id,ticketId,author.slice(0,50),text.slice(0,10000),now),env.DB.prepare(`UPDATE tickets SET updated_at=? WHERE id=?`).bind(now,ticketId)]);
  return Response.json({ id, created_at: now }, { status: 201 });
}
