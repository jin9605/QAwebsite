import { env } from "cloudflare:workers";
import { getCurrentUser, unauthorized } from "../../../../auth";
import { ensureTicketSchema } from "../../../ticket-schema";

const json = (data: unknown, status = 200) => Response.json(data, { status });
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "기본 설정을 확인해 주세요." }, 400); }
  if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).is_default !== "boolean") return json({ error: "기본 설정을 확인해 주세요." }, 400);
  const exists = await env.DB.prepare("SELECT id FROM ticket_templates WHERE id=? AND user_id=?").bind(id, user.id).first();
  if (!exists) return json({ error: "템플릿을 찾을 수 없습니다." }, 404);
  const isDefault = (body as { is_default: boolean }).is_default;
  if (isDefault) {
    await env.DB.batch([
      env.DB.prepare("UPDATE ticket_templates SET is_default=0 WHERE user_id=? AND is_default=1").bind(user.id),
      env.DB.prepare("UPDATE ticket_templates SET is_default=1 WHERE id=? AND user_id=?").bind(id, user.id),
    ]);
  } else {
    await env.DB.prepare("UPDATE ticket_templates SET is_default=0 WHERE id=? AND user_id=?").bind(id, user.id).run();
  }
  return json({ ok: true, is_default: isDefault });
}

export async function PUT(request: Request, { params }: Context) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "템플릿 내용을 확인해 주세요." }, 400); }
  if (!body || typeof body !== "object") return json({ error: "템플릿 내용을 확인해 주세요." }, 400);
  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (!name || name.length > 50 || !content || content.length > 10000) return json({ error: "이름은 50자, 내용은 10000자 이내로 입력해 주세요." }, 400);
  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE ticket_templates SET name=?,content=?,updated_at=? WHERE id=? AND user_id=?").bind(name, content, now, id, user.id).run();
  if (!result.meta.changes) return json({ error: "템플릿을 찾을 수 없습니다." }, 404);
  return json({ template: { id, name, content, updated_at: now } });
}

export async function DELETE(request: Request, { params }: Context) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const result = await env.DB.prepare("DELETE FROM ticket_templates WHERE id=? AND user_id=?").bind(id, user.id).run();
  if (!result.meta.changes) return json({ error: "템플릿을 찾을 수 없습니다." }, 404);
  return json({ ok: true });
}
