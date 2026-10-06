import { env } from "cloudflare:workers";
import { canChangeTicketFields, getProjectAccess } from "../../../../../access";
import { getCurrentUser, recordAudit, recordHistory, unauthorized } from "../../../../../auth";
import { getSafeAttachmentContentType } from "../../../../../attachment-security";
import { ensureTicketSchema } from "../../../../ticket-schema";

const MAX_ATTACHMENT_SIZE = 300 * 1024 * 1024;

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  await ensureTicketSchema(); const user = await getCurrentUser(request); if (!user) return unauthorized(); const { id: ticketId, attachmentId } = await params; const ticket = await env.DB.prepare("SELECT project_id FROM tickets WHERE id=? AND deleted_at IS NULL").bind(ticketId).first<{ project_id: string }>(); if (!ticket) return Response.json({ error: "티켓을 찾을 수 없습니다." }, { status: 404 }); if (!canChangeTicketFields(await getProjectAccess(user, ticket.project_id))) return Response.json({ error: "QA 또는 프로젝트 관리자만 증빙 자료를 추가할 수 있습니다." }, { status: 403 });
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "첨부파일").slice(0, 255);
  const description = (url.searchParams.get("description") || "").slice(0, 1000);
  const size = Number(request.headers.get("content-length") || 0);
  if (!request.body || size > MAX_ATTACHMENT_SIZE) return Response.json({ error: "파일당 최대 300MB까지 첨부할 수 있습니다." }, { status: 413 });
  const contentType = getSafeAttachmentContentType(name);
  if (!contentType) return Response.json({ error: "PNG·JPG·GIF·WEBP·MP4·WEBM·MOV·로그·텍스트·JSON 파일만 첨부할 수 있습니다." }, { status: 400 });
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM attachments WHERE ticket_id=?`).bind(ticketId).first<{ count: number }>();
  if ((count?.count || 0) >= 10) return Response.json({ error: "증빙 자료는 티켓당 최대 10개까지 첨부할 수 있습니다." }, { status: 400 });
  const key = `tickets/${ticketId}/${attachmentId}-${name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await env.BUCKET.put(key, request.body, { httpMetadata: { contentType, contentDisposition: `attachment; filename="${name.replace(/"/g, "")}"` } });
  const now = new Date().toISOString();
  await env.DB.batch([env.DB.prepare(`INSERT INTO attachments (id,ticket_id,name,content_type,size,description,object_key,created_at) VALUES (?,?,?,?,?,?,?,?)`).bind(attachmentId,ticketId,name,contentType,size,description,key,now),env.DB.prepare(`UPDATE tickets SET updated_at=?,updated_by_id=?,updated_by_name=? WHERE id=? AND deleted_at IS NULL`).bind(now,user.id,user.name,ticketId)]);
  if (url.searchParams.get("initial") !== "1") await recordHistory(user, `첨부파일 추가: ${name}`, ticketId, null, { name, size, description });
  await recordAudit(request, "첨부파일 추가", "ticket", ticketId, "success", user, null, { name, size });
  return Response.json({ id: attachmentId }, { status: 201 });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const { id: ticketId, attachmentId } = await params;
  const ticket = await env.DB.prepare("SELECT project_id FROM tickets WHERE id=? AND deleted_at IS NULL").bind(ticketId).first<{ project_id: string }>();
  if (!ticket) return Response.json({ error: "티켓을 찾을 수 없습니다." }, { status: 404 });
  if (!canChangeTicketFields(await getProjectAccess(user, ticket.project_id))) return Response.json({ error: "QA 또는 프로젝트 관리자만 증빙 자료를 삭제할 수 있습니다." }, { status: 403 });
  const attachment = await env.DB.prepare("SELECT name,description,size,object_key FROM attachments WHERE id=? AND ticket_id=?").bind(attachmentId, ticketId).first<{ name: string; description: string; size: number; object_key: string }>();
  if (!attachment) return Response.json({ error: "첨부파일을 찾을 수 없습니다." }, { status: 404 });
  const now = new Date().toISOString();
  try {
    await env.BUCKET.delete(attachment.object_key);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM attachments WHERE id=? AND ticket_id=?").bind(attachmentId, ticketId),
      env.DB.prepare("UPDATE tickets SET updated_at=?,updated_by_id=?,updated_by_name=? WHERE id=? AND deleted_at IS NULL").bind(now, user.id, user.name, ticketId),
    ]);
  } catch {
    return Response.json({ error: "첨부파일 삭제 중 오류가 발생했습니다." }, { status: 500 });
  }
  await recordHistory(user, `증빙 자료 삭제: ${attachment.name}`, ticketId, { attachment: attachment.name }, { attachment: "삭제됨" });
  await recordAudit(request, "첨부파일 삭제", "ticket", ticketId, "success", user, null, { name: attachment.name });
  return Response.json({ ok: true });
}
