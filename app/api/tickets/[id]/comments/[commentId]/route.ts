import { env } from "cloudflare:workers";
import { canComment, getProjectAccess } from "../../../../../access";
import { getCurrentUser, recordAudit, unauthorized } from "../../../../../auth";
import { ensureTicketSchema } from "../../../../ticket-schema";

type RouteParams = { id: string; commentId: string };
type StoredComment = { id: string; author: string; created_by_id: string | null };

async function getEditableComment(request: Request, params: Promise<RouteParams>) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return { response: unauthorized() };
  const { id: ticketId, commentId } = await params;
  const ticket = await env.DB.prepare("SELECT project_id FROM tickets WHERE id=? AND deleted_at IS NULL").bind(ticketId).first<{ project_id: string }>();
  if (!ticket || !canComment(await getProjectAccess(user, ticket.project_id))) return { response: Response.json({ error: "이 프로젝트에 댓글을 수정하거나 삭제할 권한이 없습니다." }, { status: 403 }) };
  const comment = await env.DB.prepare("SELECT id, author, created_by_id FROM comments WHERE id=? AND ticket_id=?").bind(commentId, ticketId).first<StoredComment>();
  if (!comment) return { response: Response.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 }) };

  const ownsComment = comment.created_by_id === user.id;
  if (user.role !== "admin" && !ownsComment) return { response: Response.json({ error: comment.created_by_id ? "본인이 작성한 댓글만 수정하거나 삭제할 수 있습니다." : "계정 정보가 없는 기존 댓글은 관리자만 관리할 수 있습니다." }, { status: 403 }) };
  return { user, ticketId, commentId };
}

export async function PATCH(request: Request, { params }: { params: Promise<RouteParams> }) {
  const editable = await getEditableComment(request, params);
  if ("response" in editable) return editable.response;
  const body = await request.json() as { body?: string };
  const text = (body.body || "").trim();
  if (!text) return Response.json({ error: "댓글을 입력해 주세요." }, { status: 400 });

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE comments SET body=? WHERE id=? AND ticket_id=?").bind(text.slice(0, 10000), editable.commentId, editable.ticketId),
    env.DB.prepare("UPDATE tickets SET updated_at=?,updated_by_id=?,updated_by_name=? WHERE id=? AND deleted_at IS NULL").bind(now, editable.user.id, editable.user.name, editable.ticketId),
  ]);
  await recordAudit(request, "댓글 수정", "ticket", editable.ticketId, "success", editable.user);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<RouteParams> }) {
  const editable = await getEditableComment(request, params);
  if ("response" in editable) return editable.response;

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM comments WHERE id=? AND ticket_id=?").bind(editable.commentId, editable.ticketId),
    env.DB.prepare("UPDATE tickets SET updated_at=?,updated_by_id=?,updated_by_name=? WHERE id=? AND deleted_at IS NULL").bind(now, editable.user.id, editable.user.name, editable.ticketId),
  ]);
  await recordAudit(request, "댓글 삭제", "ticket", editable.ticketId, "success", editable.user);
  return Response.json({ ok: true });
}
