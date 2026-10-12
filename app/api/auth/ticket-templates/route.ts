import { env } from "cloudflare:workers";
import { getCurrentUser, unauthorized } from "../../../auth";
import { ensureTicketSchema } from "../../ticket-schema";

type TicketTemplate = { id: string; name: string; content: string; is_default: number; created_at: string; updated_at: string };
const MAX_TEMPLATES = 10;
const MAX_NAME_LENGTH = 50;
const MAX_CONTENT_LENGTH = 10000;
const json = (data: unknown, status = 200) => Response.json(data, { status });

export async function GET(request: Request) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const templates = await env.DB.prepare("SELECT id,name,content,is_default,created_at,updated_at FROM ticket_templates WHERE user_id=? ORDER BY is_default DESC,updated_at DESC").bind(user.id).all<TicketTemplate>();
  return json({ templates: templates.results });
}

export async function POST(request: Request) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "템플릿 내용을 확인해 주세요." }, 400); }
  if (!body || typeof body !== "object") return json({ error: "템플릿 내용을 확인해 주세요." }, 400);
  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH || !content || content.length > MAX_CONTENT_LENGTH) return json({ error: "이름은 50자, 내용은 10000자 이내로 입력해 주세요." }, 400);
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM ticket_templates WHERE user_id=?").bind(user.id).first<{ total: number }>();
  if ((count?.total || 0) >= MAX_TEMPLATES) return json({ error: "템플릿은 최대 10개까지 저장할 수 있습니다." }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO ticket_templates (id,user_id,name,content,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(id, user.id, name, content, now, now).run();
  return json({ template: { id, name, content, is_default: 0, created_at: now, updated_at: now } }, 201);
}
