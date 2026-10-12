import { env } from "cloudflare:workers";
import { canCreateTicket, getProjectAccess } from "../../access";
import { getCurrentUser, recordAudit, recordHistory, unauthorized } from "../../auth";
import { ensureTicketSchema, syncLegacyProjects } from "../ticket-schema";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const statuses = ["신규", "진행", "완료", "이슈 아님"];
const severities = ["Critical", "High", "Medium", "Low"];

export async function GET(request: Request) {
  await syncLegacyProjects();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);
  const page = Math.max(Number(url.searchParams.get("page") || 1), 1);
  const offset = (page - 1) * limit;
  const selectedValues = (key: string, allowed?: string[]) => [...new Set(url.searchParams.getAll(key).flatMap(value => value.split(",")).map(value => value.trim()).filter(value => value && (!allowed || allowed.includes(value)))).values()].slice(0, 20);
  const projectIds = selectedValues("project_id");
  const selectedStatuses = selectedValues("status", statuses);
  const selectedSeverities = selectedValues("severity", severities);
  const assigneeIds = selectedValues("assignee_id");
  const creatorIds = selectedValues("creator_id");
  const due = url.searchParams.get("due") || "";
  const keyword = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const sort = url.searchParams.get("sort") || "updated";
  const include = new Set(url.searchParams.getAll("include").flatMap(value => value.split(",")).map(value => value.trim()));
  const orderBy = sort === "created" ? "tickets.created_at DESC" : sort === "oldest" ? "tickets.created_at ASC" : sort === "severity" ? "CASE tickets.severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 ELSE 5 END, tickets.updated_at DESC" : sort === "due" ? "CASE WHEN tickets.due_at IS NULL OR tickets.due_at='' THEN 1 ELSE 0 END, tickets.due_at ASC" : "tickets.updated_at DESC";
  const where = ["tickets.deleted_at IS NULL", "(?='admin' OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=tickets.project_id AND pm.user_id=?))"];
  const values: Array<string | number> = [user.role, user.id];
  const addMultiFilter = (column: string, selected: string[]) => { if (selected.length) { where.push(`${column} IN (${selected.map(() => "?").join(",")})`); values.push(...selected); } };
  addMultiFilter("tickets.project_id", projectIds);
  addMultiFilter("tickets.status", selectedStatuses);
  addMultiFilter("tickets.severity", selectedSeverities);
  if (assigneeIds.includes("unassigned")) {
    const assignedIds = assigneeIds.filter(id => id !== "unassigned");
    const assigneeConditions = ["tickets.assignee_id IS NULL", "tickets.assignee_id=''"];
    if (assignedIds.length) {
      assigneeConditions.push(`tickets.assignee_id IN (${assignedIds.map(() => "?").join(",")})`);
      values.push(...assignedIds);
    }
    where.push(`(${assigneeConditions.join(" OR ")})`);
  } else addMultiFilter("tickets.assignee_id", assigneeIds);
  addMultiFilter("tickets.created_by_id", creatorIds);
  if (due === "overdue") where.push("tickets.due_at IS NOT NULL AND tickets.due_at<>'' AND date(tickets.due_at)<date('now')");
  if (due === "today") where.push("date(tickets.due_at)=date('now')");
  if (due === "three_days") where.push("tickets.due_at IS NOT NULL AND tickets.due_at<>'' AND date(tickets.due_at) BETWEEN date('now') AND date('now','+3 days')");
  if (due === "week") where.push("tickets.due_at IS NOT NULL AND tickets.due_at<>'' AND date(tickets.due_at) BETWEEN date('now') AND date('now','+7 days')");
  if (due === "none") where.push("(tickets.due_at IS NULL OR tickets.due_at='')");
  if (keyword) {
    where.push("(tickets.id LIKE ? OR tickets.title LIKE ? OR tickets.content LIKE ? OR EXISTS (SELECT 1 FROM projects search_projects WHERE search_projects.id=tickets.project_id AND (search_projects.ticket_name || '-' || printf('%04d', tickets.ticket_number)) LIKE ?))");
    values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const condition = where.join(" AND ");
  const [count, ticketResult] = await Promise.all([
    include.has("pagination") ? env.DB.prepare(`SELECT COUNT(*) AS count FROM tickets WHERE ${condition}`).bind(...values).first<{ count: number }>() : Promise.resolve(null),
    env.DB.prepare(`SELECT tickets.id,tickets.title,tickets.status,tickets.severity,tickets.game,tickets.project_id,tickets.ticket_number,projects.ticket_name,tickets.assignee_id,COALESCE(assignee.name,tickets.assignee) AS assignee,tickets.due_at,tickets.created_at,tickets.updated_at,tickets.created_by_id,tickets.created_by_name,tickets.updated_by_name FROM tickets LEFT JOIN users assignee ON assignee.id=tickets.assignee_id LEFT JOIN projects ON projects.id=tickets.project_id WHERE ${condition} ORDER BY ${orderBy},tickets.id DESC LIMIT ? OFFSET ?`).bind(...values, limit, offset).all(),
  ]);
  const results = ticketResult.results;
  const summaryCondition = "tickets.deleted_at IS NULL AND (?='admin' OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=tickets.project_id AND pm.user_id=?))";
  const summary = include.has("summary") ? await env.DB.prepare(`SELECT
    COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN tickets.status='신규' THEN 1 ELSE 0 END), 0) AS status_new,
    COALESCE(SUM(CASE WHEN tickets.status='진행' THEN 1 ELSE 0 END), 0) AS status_in_progress,
    COALESCE(SUM(CASE WHEN tickets.status='완료' THEN 1 ELSE 0 END), 0) AS status_done,
    COALESCE(SUM(CASE WHEN tickets.status='이슈 아님' THEN 1 ELSE 0 END), 0) AS status_not_issue,
    COALESCE(SUM(CASE WHEN tickets.severity='Critical' THEN 1 ELSE 0 END), 0) AS severity_critical,
    COALESCE(SUM(CASE WHEN tickets.severity='High' THEN 1 ELSE 0 END), 0) AS severity_high,
    COALESCE(SUM(CASE WHEN tickets.severity='Medium' THEN 1 ELSE 0 END), 0) AS severity_medium,
    COALESCE(SUM(CASE WHEN tickets.severity='Low' THEN 1 ELSE 0 END), 0) AS severity_low,
    COALESCE(SUM(CASE WHEN tickets.assignee_id=? THEN 1 ELSE 0 END), 0) AS mine,
    COALESCE(SUM(CASE WHEN tickets.status NOT IN ('완료','이슈 아님') THEN 1 ELSE 0 END), 0) AS open,
    COALESCE(SUM(CASE WHEN tickets.due_at IS NOT NULL AND tickets.due_at<>'' AND tickets.status NOT IN ('완료','이슈 아님') AND date(tickets.due_at)<=date('now','+3 days') THEN 1 ELSE 0 END), 0) AS due_soon
    FROM tickets WHERE ${summaryCondition}`).bind(user.id, user.role, user.id).first() : null;
  const accessCondition = "tickets.deleted_at IS NULL AND (?='admin' OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=tickets.project_id AND pm.user_id=?))";
  const filterOptions = include.has("filters") ? await Promise.all([
    env.DB.prepare(`SELECT DISTINCT projects.id,projects.name FROM tickets JOIN projects ON projects.id=tickets.project_id WHERE ${accessCondition} ORDER BY projects.name`).bind(user.role, user.id).all<{ id: string; name: string }>(),
    env.DB.prepare(`SELECT DISTINCT users.id,users.name FROM tickets JOIN users ON users.id=tickets.assignee_id WHERE ${accessCondition} ORDER BY users.name`).bind(user.role, user.id).all<{ id: string; name: string }>(),
    env.DB.prepare(`SELECT DISTINCT users.id,users.name FROM tickets JOIN users ON users.id=tickets.created_by_id WHERE ${accessCondition} ORDER BY users.name`).bind(user.role, user.id).all<{ id: string; name: string }>(),
  ]) : null;
  return json({ tickets: results, pagination: { page, limit, total: count?.count || 0, hasNext: count ? offset + results.length < count.count : false }, ...(summary ? { summary } : {}), ...(filterOptions ? { filterOptions: { projects: filterOptions[0].results, assignees: filterOptions[1].results, creators: filterOptions[2].results } } : {}) });
}

export async function POST(request: Request) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const body = await request.json() as Record<string, string>;
  const title = (body.title || "").trim();
  if (!title || title.length > 100) return json({ error: "제목은 1~100자로 입력해 주세요." }, 400);
  const projectId = body.project_id || "";
  const project = projectId ? await env.DB.prepare("SELECT id,name,due_at,ticket_name FROM projects WHERE id=?").bind(projectId).first<{ id: string; name: string; due_at: string; ticket_name: string | null }>() : null;
  if (!project) return json({ error: "티켓을 연결할 프로젝트를 선택해 주세요." }, 400);
  const access = await getProjectAccess(user, project.id);
  if (!canCreateTicket(access)) return json({ error: "이 프로젝트에 티켓을 생성할 권한이 없습니다." }, 403);
  const assigneeId = body.assignee_id || null;
  const assignee = assigneeId ? await env.DB.prepare("SELECT users.id,users.name FROM project_members JOIN users ON users.id=project_members.user_id WHERE project_members.project_id=? AND users.id=? AND users.status='approved'").bind(project.id, assigneeId).first<{ id: string; name: string }>() : null;
  if (assigneeId && !assignee) return json({ error: "프로젝트 멤버만 담당자로 지정할 수 있습니다." }, 400);
  const status = body.status || "신규";
  if (!statuses.includes(status) || (status !== "신규" && user.role !== "admin" && access?.role !== "project_admin" && access?.role !== "qa")) return json({ error: "새 티켓은 신규 상태로 등록해야 합니다." }, 400);
  const severity = severities.includes(body.severity || "") ? body.severity : "Medium";
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const sequence = project.ticket_name ? await env.DB.prepare("SELECT COALESCE(MAX(ticket_number), 0) + 1 AS next_number FROM tickets WHERE project_id=?").bind(project.id).first<{ next_number: number }>() : null;
  const ticketNumber = sequence?.next_number || null;
  const ticket = { id, title, status, severity, game: project.name, project_id: project.id, ticket_number: ticketNumber, assignee_id: assignee?.id || null, assignee: assignee?.name || null, due_at: body.due_at || project.due_at || null, environment: body.environment || "", frequency: body.frequency || "항상", reproduction: body.reproduction || "", content: body.content || "", issue_reason: "" };
  await env.DB.prepare(`INSERT INTO tickets (id,title,status,severity,game,project_id,ticket_number,assignee_id,assignee,due_at,environment,frequency,reproduction,content,issue_reason,created_by_id,created_by_name,updated_by_id,updated_by_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(ticket.id,ticket.title,ticket.status,ticket.severity,ticket.game,ticket.project_id,ticket.ticket_number,ticket.assignee_id,ticket.assignee,ticket.due_at,ticket.environment,ticket.frequency,ticket.reproduction,ticket.content,ticket.issue_reason,user.id,user.name,user.id,user.name,now,now).run();
  await recordHistory(user, "티켓 생성", id, null, ticket);
  await recordAudit(request, "티켓 생성", "ticket", id, "success", user, null, { project_id: project.id });
  return json({ id }, 201);
}
