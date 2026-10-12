import { env } from "cloudflare:workers";
import { getProjectAccess } from "../../../../access";
import { getCurrentUser, unauthorized } from "../../../../auth";
import { ensureTicketSchema } from "../../../ticket-schema";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const statuses = ["신규", "진행", "완료", "이슈 아님"] as const;
const severities = ["Critical", "High", "Medium", "Low"] as const;

const dateKey = (value: Date) => value.toISOString().slice(0, 10);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const { id } = await params;
  const access = await getProjectAccess(user, id);
  if (!access) return json({ error: "프로젝트 접근 권한이 없습니다." }, 403);

  const project = await env.DB.prepare("SELECT id,name,start_date,due_at,status,created_at FROM projects WHERE id=?").bind(id).first<{ id: string; name: string; start_date: string | null; due_at: string | null; status: string; created_at: string | null }>();
  if (!project) return json({ error: "프로젝트를 찾을 수 없습니다." }, 404);

  const rangeStart = new Date(project.created_at || project.start_date || Date.now());
  rangeStart.setHours(0, 0, 0, 0);
  const dueAt = new Date(project.due_at || rangeStart);
  dueAt.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rangeEnd = dueAt < today ? dueAt : today;
  if (rangeEnd < rangeStart) rangeEnd.setTime(rangeStart.getTime());
  const rangeEndExclusive = new Date(rangeEnd.getTime() + 86400000);
  const rangeDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1;
  const [statusResult, severityResult, statusSeverityResult, assigneeResult, createdResult, updatedResult, ticketResult, deletedResult, deletedTicketResult] = await Promise.all([
    env.DB.prepare("SELECT status,COUNT(*) AS count FROM tickets WHERE project_id=? AND deleted_at IS NULL GROUP BY status").bind(id).all<{ status: string; count: number }>(),
    env.DB.prepare("SELECT severity,COUNT(*) AS count FROM tickets WHERE project_id=? AND deleted_at IS NULL GROUP BY severity").bind(id).all<{ severity: string; count: number }>(),
    env.DB.prepare("SELECT severity,status,COUNT(*) AS count FROM tickets WHERE project_id=? AND deleted_at IS NULL GROUP BY severity,status").bind(id).all<{ severity: string; status: string; count: number }>(),
    env.DB.prepare("SELECT assignee_id,COALESCE(NULLIF(assignee,''),'미지정') AS assignee,status,COUNT(*) AS count FROM tickets WHERE project_id=? AND deleted_at IS NULL GROUP BY assignee_id,COALESCE(NULLIF(assignee,''),'미지정'),status ORDER BY assignee").bind(id).all<{ assignee_id: string | null; assignee: string; status: string; count: number }>(),
    env.DB.prepare("SELECT substr(created_at,1,10) AS day,COUNT(*) AS count FROM tickets WHERE project_id=? AND deleted_at IS NULL AND created_at >= ? AND created_at < ? GROUP BY substr(created_at,1,10)").bind(id, rangeStart.toISOString(), rangeEndExclusive.toISOString()).all<{ day: string; count: number }>(),
    env.DB.prepare("SELECT substr(updated_at,1,10) AS day,COUNT(*) AS count FROM tickets WHERE project_id=? AND deleted_at IS NULL AND updated_at <> created_at AND updated_at >= ? AND updated_at < ? GROUP BY substr(updated_at,1,10)").bind(id, rangeStart.toISOString(), rangeEndExclusive.toISOString()).all<{ day: string; count: number }>(),
    env.DB.prepare(`SELECT id,title,substr(created_at,1,10) AS created_day,
      CASE WHEN updated_at <> created_at THEN substr(updated_at,1,10) ELSE NULL END AS updated_day
      FROM tickets WHERE project_id=? AND deleted_at IS NULL
      AND ((created_at >= ? AND created_at < ?) OR (updated_at <> created_at AND updated_at >= ? AND updated_at < ?))
      ORDER BY title`).bind(id, rangeStart.toISOString(), rangeEndExclusive.toISOString(), rangeStart.toISOString(), rangeEndExclusive.toISOString()).all<{ id: string; title: string; created_day: string; updated_day: string | null }>(),
    user.role === "admin" ? env.DB.prepare("SELECT substr(deleted_at,1,10) AS day,COUNT(*) AS count FROM tickets WHERE project_id=? AND deleted_at IS NOT NULL AND deleted_at >= ? AND deleted_at < ? GROUP BY substr(deleted_at,1,10)").bind(id, rangeStart.toISOString(), rangeEndExclusive.toISOString()).all<{ day: string; count: number }>() : Promise.resolve({ results: [] as Array<{ day: string; count: number }> }),
    user.role === "admin" ? env.DB.prepare("SELECT id,title,substr(deleted_at,1,10) AS deleted_day FROM tickets WHERE project_id=? AND deleted_at IS NOT NULL AND deleted_at >= ? AND deleted_at < ? ORDER BY title").bind(id, rangeStart.toISOString(), rangeEndExclusive.toISOString()).all<{ id: string; title: string; deleted_day: string }>() : Promise.resolve({ results: [] as Array<{ id: string; title: string; deleted_day: string }> }),
  ]);

  const normalized = { "해결됨": "완료", "검증 완료": "완료", "종료": "완료", "재오픈": "진행", "보류": "진행", "중복": "이슈 아님", "거절": "이슈 아님" } as Record<string, string>;
  const counts = Object.fromEntries(statuses.map(status => [status, 0])) as Record<typeof statuses[number], number>;
  statusResult.results.forEach(row => { const status = normalized[row.status] || row.status; if (status in counts) counts[status as typeof statuses[number]] += Number(row.count) || 0; });
  const severityCounts = Object.fromEntries(severities.map(severity => [severity, 0])) as Record<typeof severities[number], number>;
  severityResult.results.forEach(row => { if (row.severity in severityCounts) severityCounts[row.severity as typeof severities[number]] += Number(row.count) || 0; });
  const statusBySeverity = Object.fromEntries(severities.map(severity => [severity, Object.fromEntries(statuses.map(status => [status, 0]))])) as Record<typeof severities[number], Record<typeof statuses[number], number>>;
  statusSeverityResult.results.forEach(row => { const status = normalized[row.status] || row.status; if (row.severity in statusBySeverity && status in counts) statusBySeverity[row.severity as typeof severities[number]][status as typeof statuses[number]] += Number(row.count) || 0; });
  const assigneeMap = new Map<string, { id: string | null; name: string; counts: Record<typeof statuses[number], number> }>();
  assigneeResult.results.forEach(row => { const status = normalized[row.status] || row.status; if (!(status in counts)) return; const key = row.assignee_id || "unassigned"; const assignee = assigneeMap.get(key) || { id: row.assignee_id, name: row.assignee, counts: Object.fromEntries(statuses.map(item => [item, 0])) as Record<typeof statuses[number], number> }; assignee.counts[status as typeof statuses[number]] += Number(row.count) || 0; assigneeMap.set(key, assignee); });
  const created = new Map(createdResult.results.map(row => [row.day, Number(row.count) || 0]));
  const updated = new Map(updatedResult.results.map(row => [row.day, Number(row.count) || 0]));
  const deleted = new Map(deletedResult.results.map(row => [row.day, Number(row.count) || 0]));
  const createdTickets = new Map<string, Array<{ id: string; title: string }>>();
  const updatedTickets = new Map<string, Array<{ id: string; title: string }>>();
  const deletedTickets = new Map<string, Array<{ id: string; title: string }>>();
  ticketResult.results.forEach(ticket => {
    if (ticket.created_day) createdTickets.set(ticket.created_day, [...(createdTickets.get(ticket.created_day) || []), { id: ticket.id, title: ticket.title }]);
    if (ticket.updated_day) updatedTickets.set(ticket.updated_day, [...(updatedTickets.get(ticket.updated_day) || []), { id: ticket.id, title: ticket.title }]);
  });
  deletedTicketResult.results.forEach(ticket => deletedTickets.set(ticket.deleted_day, [...(deletedTickets.get(ticket.deleted_day) || []), { id: ticket.id, title: ticket.title }]));
  const activity = Array.from({ length: rangeDays }, (_, index) => {
    const day = new Date(rangeStart.getTime() + index * 86400000);
    const key = dateKey(day);
    return { day: key, created: created.get(key) || 0, updated: updated.get(key) || 0, deleted: deleted.get(key) || 0, created_tickets: createdTickets.get(key) || [], updated_tickets: updatedTickets.get(key) || [], deleted_tickets: deletedTickets.get(key) || [] };
  });
  return json({ project, status_counts: counts, severity_counts: severityCounts, status_by_severity: statusBySeverity, assignee_statuses: [...assigneeMap.values()].map(assignee => ({ id: assignee.id, name: assignee.name, counts: assignee.counts, total: Object.values(assignee.counts).reduce((sum, value) => sum + value, 0) })), can_view_deletions: user.role === "admin", activity });
}
