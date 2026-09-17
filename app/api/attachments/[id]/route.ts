import { env } from "cloudflare:workers";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const row = await env.DB.prepare(`SELECT object_key,name,content_type FROM attachments WHERE id=?`).bind(id).first<{object_key:string;name:string;content_type:string}>();
  if (!row) return new Response("Not found",{status:404}); const object=await env.BUCKET.get(row.object_key); if(!object) return new Response("Not found",{status:404}); const headers=new Headers(); object.writeHttpMetadata(headers); headers.set("content-disposition",`inline; filename*=UTF-8''${encodeURIComponent(row.name)}`); return new Response(object.body,{headers});
}
