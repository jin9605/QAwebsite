import { env } from "cloudflare:workers";

const MAX_ATTACHMENT_SIZE = 300 * 1024 * 1024;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { id: ticketId, attachmentId } = await params;
  const name = (new URL(request.url).searchParams.get("name") || "첨부파일").slice(0, 255);
  const description = (new URL(request.url).searchParams.get("description") || "").slice(0, 1000);
  const size = Number(request.headers.get("content-length") || 0);
  if (!request.body || size > MAX_ATTACHMENT_SIZE) return Response.json({ error: "파일당 최대 300MB까지 첨부할 수 있습니다." }, { status: 413 });
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM attachments WHERE ticket_id=?`).bind(ticketId).first<{ count: number }>();
  if ((count?.count || 0) >= 10) return Response.json({ error: "증빙 자료는 티켓당 최대 10개까지 첨부할 수 있습니다." }, { status: 400 });
  const type = request.headers.get("content-type") || "application/octet-stream";
  const key = `tickets/${ticketId}/${attachmentId}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await env.BUCKET.put(key, request.body, { httpMetadata: { contentType: type, contentDisposition: `inline; filename="${name.replace(/"/g, "")}"` } });
  const now = new Date().toISOString();
  await env.DB.batch([env.DB.prepare(`INSERT INTO attachments (id,ticket_id,name,content_type,size,description,object_key,created_at) VALUES (?,?,?,?,?,?,?,?)`).bind(attachmentId,ticketId,name,type,size,description,key,now),env.DB.prepare(`UPDATE tickets SET updated_at=? WHERE id=?`).bind(now,ticketId)]);
  return Response.json({ id: attachmentId }, { status: 201 });
}
