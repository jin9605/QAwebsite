import { env } from "cloudflare:workers";
import { canComment, getProjectAccess } from "../../../../access";
import { getCurrentUser, recordAudit, unauthorized } from "../../../../auth";
import { ensureTicketSchema } from "../../../ticket-schema";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTicketSchema(); const user = await getCurrentUser(request); if (!user) return unauthorized(); const { id: ticketId } = await params; const ticket = await env.DB.prepare("SELECT project_id FROM tickets WHERE id=? AND deleted_at IS NULL").bind(ticketId).first<{ project_id: string }>(); if (!ticket || !canComment(await getProjectAccess(user, ticket.project_id))) return Response.json({ error: "이 프로젝트에 댓글을 작성할 권한이 없습니다." }, { status: 403 }); const body = await request.json() as { body?: string };
  const text = (body.body || "").trim();
  if (!text) return Response.json({ error: "댓글을 입력해 주세요." }, { status: 400 });
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await env.DB.batch([env.DB.prepare(`INSERT INTO comments (id,ticket_id,author,created_by_id,body,created_at) VALUES (?,?,?,?,?,?)`).bind(id,ticketId,user.name,user.id,text.slice(0,10000),now),env.DB.prepare(`UPDATE tickets SET updated_at=?,updated_by_id=?,updated_by_name=? WHERE id=? AND deleted_at IS NULL`).bind(now,user.id,user.name,ticketId)]); await recordAudit(request, "댓글 등록", "ticket", ticketId, "success", user);
  return Response.json({ id, created_at: now }, { status: 201 });
}
