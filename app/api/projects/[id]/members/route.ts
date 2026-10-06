import { env } from "cloudflare:workers";
import { PROJECT_ROLES, getProjectAccess } from "../../../../access";
import { getCurrentUser, recordAudit, unauthorized } from "../../../../auth";
import { ensureTicketSchema } from "../../../ticket-schema";

const json = (data: unknown, status = 200) => Response.json(data, { status });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  if (!await getProjectAccess(user, id)) return json({ error: "프로젝트 접근 권한이 없습니다." }, 403);
  const { results } = await env.DB.prepare("SELECT users.id,users.name,users.email,project_members.role FROM project_members JOIN users ON users.id=project_members.user_id WHERE project_members.project_id=? AND users.status='approved' ORDER BY users.name").bind(id).all();
  return json({ members: results });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const access = await getProjectAccess(user, id);
  if (user.role !== "admin" && access?.role !== "project_admin") return json({ error: "프로젝트 관리자만 멤버를 관리할 수 있습니다." }, 403);
  const body = await request.json() as { user_id?: string; role?: string };
  if (!body.user_id || !body.role || !PROJECT_ROLES.includes(body.role as typeof PROJECT_ROLES[number])) return json({ error: "사용자와 프로젝트 역할을 확인해 주세요." }, 400);
  const member = await env.DB.prepare("SELECT id FROM users WHERE id=? AND status='approved'").bind(body.user_id).first();
  if (!member) return json({ error: "승인된 사용자를 찾을 수 없습니다." }, 404);
  await env.DB.prepare("INSERT INTO project_members (project_id,user_id,role,added_by_id,created_at) VALUES (?,?,?,?,?) ON CONFLICT(project_id,user_id) DO UPDATE SET role=excluded.role,added_by_id=excluded.added_by_id").bind(id,body.user_id,body.role,user.id,new Date().toISOString()).run();
  await recordAudit(request, "프로젝트 멤버 추가 또는 변경", "project", id, "success", user, null, { user_id: body.user_id, role: body.role });
  return json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const access = await getProjectAccess(user, id);
  if (user.role !== "admin" && access?.role !== "project_admin") return json({ error: "프로젝트 관리자만 멤버를 관리할 수 있습니다." }, 403);
  const userId = new URL(request.url).searchParams.get("user_id");
  if (!userId) return json({ error: "사용자를 선택해 주세요." }, 400);
  const adminCount = await env.DB.prepare("SELECT COUNT(*) AS count FROM project_members WHERE project_id=? AND role='project_admin'").bind(id).first<{ count: number }>();
  const target = await env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?").bind(id,userId).first<{ role: string }>();
  if (target?.role === "project_admin" && (adminCount?.count || 0) < 2) return json({ error: "프로젝트 관리자는 최소 1명이어야 합니다." }, 400);
  await env.DB.prepare("DELETE FROM project_members WHERE project_id=? AND user_id=?").bind(id,userId).run();
  await recordAudit(request, "프로젝트 멤버 제거", "project", id, "success", user, null, { user_id: userId });
  return json({ ok: true });
}
