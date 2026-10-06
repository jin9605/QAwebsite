import { env } from "cloudflare:workers";
import { canAccessProject } from "../../../access";
import { getSafeAttachmentContentType, isInlinePreviewContentType } from "../../../attachment-security";
import { getCurrentUser, unauthorized } from "../../../auth";
import { ensureTicketSchema } from "../../ticket-schema";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTicketSchema(); const user = await getCurrentUser(request); if (!user) return unauthorized(); const { id } = await params; const row = await env.DB.prepare(`SELECT attachments.object_key,attachments.name,attachments.content_type,tickets.project_id FROM attachments JOIN tickets ON tickets.id=attachments.ticket_id WHERE attachments.id=? AND tickets.deleted_at IS NULL`).bind(id).first<{object_key:string;name:string;content_type:string;project_id:string}>();
  if (!row || !await canAccessProject(user, row.project_id)) return new Response("Not found",{status:404});
  const object=await env.BUCKET.get(row.object_key); if(!object) return new Response("Not found",{status:404}); const headers=new Headers(); object.writeHttpMetadata(headers);
  const contentType = getSafeAttachmentContentType(row.name);
  const inline = contentType && isInlinePreviewContentType(contentType) && !new URL(request.url).searchParams.has("download");
  headers.set("content-type", contentType || "application/octet-stream");
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-disposition",`${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.name)}`); return new Response(object.body,{headers});
}
