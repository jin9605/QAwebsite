import { env } from "cloudflare:workers";
import { canChangeTicketFields, getProjectAccess } from "../../../../access";
import { getCurrentUser, recordAudit, recordHistory, unauthorized } from "../../../../auth";
import { getSafeAttachmentContentType } from "../../../../attachment-security";
import { ensureTicketSchema } from "../../../ticket-schema";
const MAX_ATTACHMENT_SIZE = 300 * 1024 * 1024;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTicketSchema(); const user = await getCurrentUser(request); if (!user) return unauthorized(); const { id: ticketId } = await params; const ticket = await env.DB.prepare("SELECT project_id FROM tickets WHERE id=? AND deleted_at IS NULL").bind(ticketId).first<{ project_id: string }>(); if (!ticket) return Response.json({ error: "티켓을 찾을 수 없습니다." }, { status: 404 }); if (!canChangeTicketFields(await getProjectAccess(user, ticket.project_id))) return Response.json({ error: "QA 또는 프로젝트 관리자만 증빙 자료를 추가할 수 있습니다." }, { status: 403 }); const form = await request.formData(); const files = form.getAll("files").filter((x): x is File => x instanceof File); const descriptions = JSON.parse(String(form.get("descriptions") || "[]")) as string[];
  if (!files.length) return Response.json({ error: "파일이 없습니다." }, { status: 400 });
  const invalid = files.find(file => file.size > MAX_ATTACHMENT_SIZE || !getSafeAttachmentContentType(file.name));
  if (invalid) return Response.json({ error: `이미지·동영상·로그 파일만 첨부할 수 있으며, 파일당 최대 300MB입니다. (${invalid.name})` }, { status: 400 });
  const now = new Date().toISOString(), created = [] as unknown[];
  for (let i=0;i<files.length;i++) { const file=files[i], id=crypto.randomUUID(), contentType=getSafeAttachmentContentType(file.name)! , key=`tickets/${ticketId}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    await env.BUCKET.put(key,file.stream(),{httpMetadata:{contentType,contentDisposition:`attachment; filename="${file.name.replace(/"/g,"")}"`}});
    await env.DB.prepare(`INSERT INTO attachments (id,ticket_id,name,content_type,size,description,object_key,created_at) VALUES (?,?,?,?,?,?,?,?)`).bind(id,ticketId,file.name,contentType,file.size,descriptions[i]||"",key,now).run(); created.push({id,name:file.name}); }
  await env.DB.prepare(`UPDATE tickets SET updated_at=?,updated_by_id=?,updated_by_name=? WHERE id=? AND deleted_at IS NULL`).bind(now,user.id,user.name,ticketId).run(); await recordHistory(user, "증빙 자료 첨부", ticketId, null, { count: files.length }); await recordAudit(request, "증빙 자료 첨부", "ticket", ticketId, "success", user, null, { count: files.length }); return Response.json({ attachments:created },{status:201});
}
