import { env } from "cloudflare:workers";
import { getCurrentUser, recordAudit, unauthorized } from "../../../auth";
import { ensureTicketSchema } from "../../ticket-schema";

const json = (data: unknown, status = 200) => Response.json(data, { status });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  if (user.role !== "admin") return json({ error: "관리자만 프로젝트를 수정할 수 있습니다." }, 403);
  const { id } = await params;
  const body = await request.json() as Record<string, string>;
  const name = (body.name || "").trim();
  if (!name || name.length > 100) return json({ error: "프로젝트명을 확인해 주세요." }, 400);
  const dueAt = (body.due_at || "").trim();
  if (dueAt && !/^\d{4}-\d{2}-\d{2}$/.test(dueAt)) return json({ error: "프로젝트 마감일 형식을 확인해 주세요." }, 400);
  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE projects SET name=?,start_date=?,due_at=?,owner=?,status=?,updated_at=? WHERE id=?").bind(name, body.start_date || null, dueAt, (body.owner || "").trim(), body.status || "준비", now, id).run();
  if (!result.meta.changes) return json({ error: "프로젝트를 찾을 수 없습니다." }, 404);
  await env.DB.prepare("UPDATE tickets SET game=? WHERE project_id=? AND deleted_at IS NULL").bind(name, id).run();
  await recordAudit(request, "프로젝트 수정", "project", id, "success", user);
  return json({ ok: true });
}
