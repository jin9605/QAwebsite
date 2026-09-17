import { env } from "cloudflare:workers";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ticketId } = await params; const form = await request.formData(); const files = form.getAll("files").filter((x): x is File => x instanceof File); const descriptions = JSON.parse(String(form.get("descriptions") || "[]")) as string[];
  if (!files.length) return Response.json({ error: "파일이 없습니다." }, { status: 400 });
  const now = new Date().toISOString(), created = [] as unknown[];
  for (let i=0;i<files.length;i++) { const file=files[i], id=crypto.randomUUID(), key=`tickets/${ticketId}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
    await env.BUCKET.put(key,file.stream(),{httpMetadata:{contentType:file.type || "application/octet-stream",contentDisposition:`inline; filename="${file.name.replace(/"/g,"")}"`}});
    await env.DB.prepare(`INSERT INTO attachments (id,ticket_id,name,content_type,size,description,object_key,created_at) VALUES (?,?,?,?,?,?,?,?)`).bind(id,ticketId,file.name,file.type,file.size,descriptions[i]||"",key,now).run(); created.push({id,name:file.name}); }
  await env.DB.prepare(`UPDATE tickets SET updated_at=? WHERE id=?`).bind(now,ticketId).run(); return Response.json({ attachments:created },{status:201});
}
