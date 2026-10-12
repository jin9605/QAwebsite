import { env } from "cloudflare:workers";
import { getCurrentUser, recordAudit, unauthorized } from "../../auth";
import { ensureTicketSchema, syncLegacyProjects } from "../ticket-schema";

const json = (data: unknown, status = 200) => Response.json(data, { status });

export async function GET(request: Request) {
  await syncLegacyProjects();
  const user = await getCurrentUser(request); if (!user) return unauthorized();
  const { results } = await env.DB.prepare(`SELECT projects.id,projects.name,projects.ticket_name,projects.start_date,projects.due_at,projects.owner,projects.status,projects.created_at,projects.updated_at,COUNT(tickets.id) AS ticket_count FROM projects LEFT JOIN tickets ON tickets.project_id=projects.id AND tickets.deleted_at IS NULL WHERE (?='admin' OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=projects.id AND pm.user_id=?)) GROUP BY projects.id HAVING projects.created_by_id <> 'legacy' OR COUNT(tickets.id) > 0 ORDER BY CASE WHEN projects.due_at='' THEN 1 ELSE 0 END, projects.due_at, projects.name`).bind(user.role,user.id).all();
  return json({ projects: results });
}

export async function POST(request: Request) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  if (user.role !== "admin") return json({ error: "관리자만 프로젝트를 만들 수 있습니다." }, 403);
  const body = await request.json() as Record<string, string>;
  const name = (body.name || "").trim();
  const dueAt = body.due_at || "";
  if (!name || name.length > 100) return json({ error: "프로젝트명은 1~100자로 입력해 주세요." }, 400);
  if (!dueAt) return json({ error: "프로젝트 마감일을 선택해 주세요." }, 400);
  const id = crypto.randomUUID();
  const suppliedTicketName = (body.ticket_name || "").trim().toUpperCase();
  const ticketName = /^[A-Z][A-Z0-9]{1,9}$/.test(suppliedTicketName) ? suppliedTicketName : `P${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const now = new Date().toISOString();
  try {
    await env.DB.prepare("INSERT INTO projects (id,name,ticket_name,start_date,due_at,owner,status,created_by_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id, name, ticketName, body.start_date || null, dueAt, (body.owner || "").trim(), body.status || "준비", user.id, now, now).run();
  } catch (error) {
    if (String(error).includes("UNIQUE constraint failed")) return json({ error: "같은 프로젝트명 또는 티켓명이 이미 있습니다." }, 409);
    throw error;
  }
  await env.DB.prepare("INSERT INTO project_members (project_id,user_id,role,added_by_id,created_at) VALUES (?,?,?,?,?)").bind(id,user.id,"project_admin",user.id,now).run();
  await recordAudit(request, "프로젝트 생성", "project", id, "success", user, null, { name, ticket_name: ticketName });
  return json({ id }, 201);
}
