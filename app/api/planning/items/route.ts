import { env } from "cloudflare:workers";
import { getProjectAccess } from "../../../access";
import { getCurrentUser, recordAudit, unauthorized } from "../../../auth";
import { ensureTicketSchema } from "../../ticket-schema";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const itemKinds = ["feature", "slot", "decision"];
const featureStatuses = ["초안", "검토 중", "확정", "변경 요청", "폐기"];
const developmentStatuses = ["개발 대기", "개발 중", "PR 검토", "QA 대기", "완료"];
const qaStatuses = ["미연결", "신규", "진행", "완료", "이슈 아님"];
const parseIds = (value: unknown) => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === "string" && /^[\w-]{1,100}$/.test(id)).slice(0, 50))] : [];

export async function GET(request: Request) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "feature";
  if (!itemKinds.includes(kind)) return json({ error: "올바르지 않은 기획 항목입니다." }, 400);
  const { results } = await env.DB.prepare(`SELECT items.*,projects.name AS project_name FROM planning_items items LEFT JOIN projects ON projects.id=items.project_id WHERE items.kind=? AND (items.project_id IS NULL OR ?='admin' OR EXISTS (SELECT 1 FROM project_members members WHERE members.project_id=items.project_id AND members.user_id=?)) ORDER BY items.updated_at DESC LIMIT 200`).bind(kind, user.role, user.id).all();
  return json({ items: results });
}

export async function POST(request: Request) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  if (user.role === "viewer") return json({ error: "조회 전용 계정은 기획 항목을 등록할 수 없습니다." }, 403);
  const body = await request.json() as Record<string, unknown>;
  const kind = typeof body.kind === "string" ? body.kind : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const projectId = typeof body.project_id === "string" ? body.project_id.trim() : "";
  const status = typeof body.status === "string" ? body.status : "초안";
  if (!itemKinds.includes(kind) || !title || title.length > 150) return json({ error: "기획 항목 종류와 제목을 확인해 주세요." }, 400);
  if (kind === "feature" && !projectId) return json({ error: "기능 항목은 프로젝트를 연결해 주세요." }, 400);
  if (kind === "feature" && !featureStatuses.includes(status)) return json({ error: "기획 상태를 확인해 주세요." }, 400);
  if (projectId) {
    const access = await getProjectAccess(user, projectId);
    if (!access || access.role === "viewer") return json({ error: "이 프로젝트에 기획 항목을 등록할 권한이 없습니다." }, 403);
  } else if (user.role !== "admin") return json({ error: "회사 공통 항목은 관리자만 등록할 수 있습니다." }, 403);
  const developmentStatus = typeof body.development_status === "string" && developmentStatuses.includes(body.development_status) ? body.development_status : "개발 대기";
  const qaStatus = typeof body.qa_status === "string" && qaStatuses.includes(body.qa_status) ? body.qa_status : "미연결";
  const id = crypto.randomUUID(); const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO planning_items (id,kind,project_id,code,title,summary,status,development_status,qa_status,tags,linked_document_ids,linked_ticket_ids,created_by_id,created_by_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,kind,projectId || null,typeof body.code === "string" ? body.code.trim().toUpperCase().slice(0, 30) || null : null,title,typeof body.summary === "string" ? body.summary.trim().slice(0, 5000) : "",status,developmentStatus,qaStatus,typeof body.tags === "string" ? body.tags.trim().slice(0, 200) : "",JSON.stringify(parseIds(body.linked_document_ids)),JSON.stringify(parseIds(body.linked_ticket_ids)),user.id,user.name,now,now).run();
  await recordAudit(request, `${kind === "feature" ? "기능" : kind === "slot" ? "슬롯" : "결정 기록"} 등록`, "planning_item", id, "success", user, null, { kind, project_id: projectId || null, title });
  return json({ id }, 201);
}
