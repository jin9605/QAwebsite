import { env } from "cloudflare:workers";
import { canChangeTicketFields, canTransitionStatus, getProjectAccess } from "../../../access";
import { getCurrentUser, recordAudit, recordHistory, unauthorized } from "../../../auth";
import { ensureTicketSchema } from "../../ticket-schema";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const statuses = ["신규", "진행", "완료", "이슈 아님"];
type TicketSnapshot = { title: string; status: string; severity: string; game: string | null; project_id: string | null; assignee_id: string | null; assignee: string | null; due_at: string | null; environment: string | null; frequency: string | null; reproduction: string | null; content: string | null; issue_reason: string | null };
const trackedFields: Array<keyof TicketSnapshot> = ["title", "status", "severity", "game", "assignee_id", "due_at", "environment", "frequency", "reproduction", "content", "issue_reason"];
const fieldNames: Record<keyof TicketSnapshot, string> = { title: "제목", status: "진행상황", severity: "위험도·심각도", game: "프로젝트", project_id: "프로젝트", assignee_id: "담당자", assignee: "담당자", due_at: "마감일", environment: "발생 환경", frequency: "발생 빈도", reproduction: "재현 횟수", content: "내용", issue_reason: "이슈 아님 사유" };

async function getTicketWithAccess(request: Request, params: Promise<{ id: string }>) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return { response: unauthorized() };
  const { id } = await params;
  const ticket = await env.DB.prepare("SELECT * FROM tickets WHERE id=? AND deleted_at IS NULL").bind(id).first<TicketSnapshot & { id: string; created_by_id: string; project_id: string }>();
  if (!ticket) return { response: json({ error: "티켓을 찾을 수 없습니다." }, 404) };
  const access = await getProjectAccess(user, ticket.project_id);
  if (!access) return { response: json({ error: "이 프로젝트의 티켓을 볼 권한이 없습니다." }, 403) };
  return { user, ticket, access, id };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await getTicketWithAccess(request, params);
  if ("response" in result) return result.response;
  const attachments = await env.DB.prepare("SELECT id,name,content_type,size,description,created_at FROM attachments WHERE ticket_id=? ORDER BY created_at").bind(result.id).all();
  const comments = await env.DB.prepare("SELECT * FROM comments WHERE ticket_id=? ORDER BY created_at").bind(result.id).all();
  const history = await env.DB.prepare("SELECT actor_name,action,before_json,after_json,created_at FROM ticket_history WHERE ticket_id=? ORDER BY created_at DESC").bind(result.id).all();
  return json({ ticket: result.ticket, attachments: attachments.results, comments: comments.results, history: history.results });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (new URL(request.url).searchParams.get("action") === "restore") {
    await ensureTicketSchema();
    const user = await getCurrentUser(request);
    if (!user) return unauthorized();
    if (user.role !== "admin") return json({ error: "관리자만 복구할 수 있습니다." }, 403);
    const { id } = await params;
    const now = new Date().toISOString();
    const restored = await env.DB.prepare("UPDATE tickets SET deleted_at=NULL,deleted_by_id=NULL,deleted_by_name=NULL,updated_at=?,updated_by_id=?,updated_by_name=? WHERE id=? AND deleted_at IS NOT NULL").bind(now,user.id,user.name,id).run();
    if (!restored.meta.changes) return json({ error: "휴지통 티켓을 찾을 수 없습니다." }, 404);
    await recordHistory(user, "티켓 복구", id); await recordAudit(request, "티켓 복구", "ticket", id, "success", user); return json({ ok: true });
  }
  const result = await getTicketWithAccess(request, params);
  if ("response" in result) return result.response;
  const { user, ticket: before, access, id } = result;
  const now = new Date().toISOString();
  const body = await request.json() as Record<string, string>;
  const targetProjectId = body.project_id || before.project_id;
  const project = await env.DB.prepare("SELECT id,name,due_at FROM projects WHERE id=?").bind(targetProjectId).first<{ id: string; name: string; due_at: string }>();
  if (!project) return json({ error: "프로젝트를 찾을 수 없습니다." }, 400);
  const targetAccess = await getProjectAccess(user, project.id);
  if (!targetAccess) return json({ error: "대상 프로젝트에 접근할 권한이 없습니다." }, 403);
  const assigneeId = body.assignee_id || null;
  const assignee = assigneeId ? await env.DB.prepare("SELECT users.id,users.name FROM project_members JOIN users ON users.id=project_members.user_id WHERE project_members.project_id=? AND users.id=? AND users.status='approved'").bind(project.id, assigneeId).first<{ id: string; name: string }>() : null;
  if (assigneeId && !assignee) return json({ error: "프로젝트 멤버만 담당자로 지정할 수 있습니다." }, 400);
  const nextStatus = body.status || before.status;
  if (!statuses.includes(nextStatus)) return json({ error: "잘못된 진행상황입니다." }, 400);
  const effectiveAccess = project.id === before.project_id ? access : targetAccess;
  if (!canTransitionStatus(effectiveAccess, before.status, nextStatus, before.assignee_id === user.id)) return json({ error: "이 진행상황으로 변경할 권한이 없습니다." }, 403);
  const after: TicketSnapshot = { title: (body.title || before.title || "").trim().slice(0, 100), status: nextStatus, severity: body.severity || before.severity, game: project.name, project_id: project.id, assignee_id: assignee?.id || null, assignee: assignee?.name || null, due_at: body.due_at || project.due_at || null, environment: body.environment || "", frequency: body.frequency || "항상", reproduction: body.reproduction || "", content: body.content || "", issue_reason: (body.issue_reason || "").trim().slice(0, 1000) || null };
  if (!after.title) return json({ error: "제목을 입력해 주세요." }, 400);
  if (after.status === "이슈 아님" && !after.issue_reason) return json({ error: "이슈 아님 처리 사유를 입력해 주세요." }, 400);
  const changedFields = trackedFields.filter(field => (before[field] || "") !== (after[field] || ""));
  if (!changedFields.length) return json({ ok: true, unchanged: true, updated_at: now });
  const nonStatusChange = changedFields.some(field => field !== "status");
  if (nonStatusChange && !canChangeTicketFields(effectiveAccess)) return json({ error: "QA 또는 프로젝트 관리자만 티켓 정보를 수정할 수 있습니다." }, 403);
  if (before.project_id !== project.id && (!canChangeTicketFields(access) || !canChangeTicketFields(targetAccess))) return json({ error: "원본과 대상 프로젝트 모두에서 QA 또는 프로젝트 관리자 권한이 필요합니다." }, 403);
  await env.DB.prepare("UPDATE tickets SET title=?,status=?,severity=?,game=?,project_id=?,assignee_id=?,assignee=?,due_at=?,environment=?,frequency=?,reproduction=?,content=?,issue_reason=?,updated_at=?,updated_by_id=?,updated_by_name=? WHERE id=? AND deleted_at IS NULL").bind(after.title,after.status,after.severity,after.game,after.project_id,after.assignee_id,after.assignee,after.due_at,after.environment,after.frequency,after.reproduction,after.content,after.issue_reason,now,user.id,user.name,id).run();
  await recordHistory(user, `티켓 수정: ${changedFields.map(field => fieldNames[field]).join(", ")}`, id, before, after);
  await recordAudit(request, "티켓 수정", "ticket", id, "success", user, null, { fields: changedFields });
  return json({ ok: true, updated_at: now });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permanent = new URL(request.url).searchParams.get("permanent") === "1";
  if (permanent) {
    await ensureTicketSchema();
    const user = await getCurrentUser(request);
    if (!user) return unauthorized();
    if (user.role !== "admin") return json({ error: "관리자만 완전 삭제할 수 있습니다." }, 403);
    const { id } = await params;
    const ticket = await env.DB.prepare("SELECT project_id FROM tickets WHERE id=? AND deleted_at IS NOT NULL").bind(id).first<{ project_id: string }>();
    if (!ticket) return json({ error: "휴지통 티켓을 찾을 수 없습니다." }, 404);
    const files = await env.DB.prepare("SELECT object_key FROM attachments WHERE ticket_id=?").bind(id).all<{ object_key: string }>();
    await Promise.all(files.results.map(file => env.BUCKET.delete(file.object_key)));
    await env.DB.batch([env.DB.prepare("DELETE FROM comments WHERE ticket_id=?").bind(id),env.DB.prepare("DELETE FROM attachments WHERE ticket_id=?").bind(id),env.DB.prepare("DELETE FROM tickets WHERE id=? AND deleted_at IS NOT NULL").bind(id)]);
    await recordHistory(user, "티켓 완전 삭제", id); await recordAudit(request, "티켓 완전 삭제", "ticket", id, "success", user, null, { project_id: ticket.project_id }); return json({ ok: true });
  }
  const result = await getTicketWithAccess(request, params);
  if ("response" in result) return result.response;
  const { user, ticket, id } = result;
  if (user.role !== "admin" && ticket.created_by_id !== user.id) return json({ error: "티켓 작성자 또는 관리자만 삭제할 수 있습니다." }, 403);
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE tickets SET deleted_at=?,deleted_by_id=?,deleted_by_name=?,updated_at=?,updated_by_id=?,updated_by_name=? WHERE id=? AND deleted_at IS NULL").bind(now,user.id,user.name,now,user.id,user.name,id).run();
  await recordHistory(user, "휴지통 이동", id); await recordAudit(request, "휴지통 이동", "ticket", id, "success", user); return json({ ok: true });
}
