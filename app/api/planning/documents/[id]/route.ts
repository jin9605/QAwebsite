import { env } from "cloudflare:workers";
import { canAccessProject } from "../../../../access";
import { getCurrentUser, unauthorized } from "../../../../auth";
import { ensureTicketSchema } from "../../../ticket-schema";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const document = await env.DB.prepare("SELECT project_id,object_key,source_file_name FROM planning_documents WHERE id=?").bind(id).first<{ project_id: string | null; object_key: string; source_file_name: string }>();
  if (!document || (document.project_id && !await canAccessProject(user, document.project_id))) return new Response("Not found", { status: 404 });
  const object = await env.BUCKET.get(document.object_key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(document.source_file_name)}`);
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
