import { env } from "cloudflare:workers";
import { getProjectAccess } from "../../../../access";
import { getCurrentUser, recordAudit, unauthorized } from "../../../../auth";
import { ensureTicketSchema } from "../../../ticket-schema";

const STAGE_KEYS = ["planning", "development", "qa", "release_ready", "deployed"] as const;
type Stage = { key: typeof STAGE_KEYS[number]; owner_id: string | null; criterion: string; completed: boolean };
type Plan = { concept: string; target_users: string; release_scope: string; success_criteria: string; stages: Stage[] };

const defaultStages = (): Stage[] => STAGE_KEYS.map(key => ({ key, owner_id: null, criterion: "", completed: false }));
const emptyPlan = (): Plan => ({ concept: "", target_users: "", release_scope: "", success_criteria: "", stages: defaultStages() });
const json = (data: unknown, status = 200) => Response.json(data, { status });

async function getContext(request: Request, projectId: string) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return { error: unauthorized() };
  const project = await env.DB.prepare("SELECT id,name,start_date,due_at,status FROM projects WHERE id=?").bind(projectId).first();
  if (!project) return { error: json({ error: "프로젝트를 찾을 수 없습니다." }, 404) };
  const access = await getProjectAccess(user, projectId);
  if (!access) return { error: json({ error: "프로젝트 접근 권한이 없습니다." }, 403) };
  return { user, project, access };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getContext(request, id);
  if (context.error) return context.error;
  const [stored, members, stats] = await Promise.all([
    env.DB.prepare("SELECT concept,target_users,release_scope,success_criteria,stages_json FROM project_plans WHERE project_id=?").bind(id).first<{ concept: string; target_users: string; release_scope: string; success_criteria: string; stages_json: string }>(),
    env.DB.prepare("SELECT users.id,users.name,project_members.role FROM project_members JOIN users ON users.id=project_members.user_id WHERE project_members.project_id=? AND users.status='approved' ORDER BY users.name").bind(id).all<{ id: string; name: string; role: string }>(),
    env.DB.prepare(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN status='신규' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status IN ('진행','재오픈','보류') THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status IN ('완료','해결됨','검증 완료','종료') THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status IN ('이슈 아님','중복','거절') THEN 1 ELSE 0 END) AS not_issue,
      SUM(CASE WHEN severity='Critical' AND status NOT IN ('완료','해결됨','검증 완료','종료','이슈 아님','중복','거절') THEN 1 ELSE 0 END) AS open_critical
      FROM tickets WHERE project_id=? AND deleted_at IS NULL`).bind(id).first(),
  ]);
  let stages = defaultStages();
  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored.stages_json);
      if (Array.isArray(parsed)) stages = stages.map(stage => {
        const saved = parsed.find(value => value && typeof value === "object" && value.key === stage.key);
        return saved ? { ...stage, owner_id: typeof saved.owner_id === "string" ? saved.owner_id : null, criterion: typeof saved.criterion === "string" ? saved.criterion : "", completed: saved.completed === true } : stage;
      });
    } catch { /* Existing invalid data falls back to empty stages. */ }
  }
  return json({ project: context.project, plan: stored ? { concept: stored.concept, target_users: stored.target_users, release_scope: stored.release_scope, success_criteria: stored.success_criteria, stages } : emptyPlan(), members: members.results, stats });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getContext(request, id);
  if (context.error) return context.error;
  if (context.access?.role !== "project_admin" && context.access?.role !== "qa") return json({ error: "프로젝트 관리자 또는 QA만 기획을 수정할 수 있습니다." }, 403);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "요청 내용을 확인해 주세요." }, 400); }
  if (!body || typeof body !== "object") return json({ error: "요청 내용을 확인해 주세요." }, 400);
  const input = body as Record<string, unknown>;
  const fields = ["concept", "target_users", "release_scope", "success_criteria"] as const;
  if (fields.some(field => typeof input[field] !== "string" || (input[field] as string).length > 1000)) return json({ error: "요약은 항목당 1000자 이내로 입력해 주세요." }, 400);
  if (!Array.isArray(input.stages) || input.stages.length !== STAGE_KEYS.length) return json({ error: "출시 단계가 올바르지 않습니다." }, 400);
  const stages: Stage[] = [];
  for (const [index, value] of input.stages.entries()) {
    if (!value || typeof value !== "object") return json({ error: "출시 단계를 확인해 주세요." }, 400);
    const stage = value as Record<string, unknown>;
    if (stage.key !== STAGE_KEYS[index] || (stage.owner_id !== null && typeof stage.owner_id !== "string") || typeof stage.criterion !== "string" || stage.criterion.length > 500 || typeof stage.completed !== "boolean") return json({ error: "출시 단계를 확인해 주세요." }, 400);
    stages.push({ key: STAGE_KEYS[index], owner_id: stage.owner_id || null, criterion: stage.criterion.trim(), completed: stage.completed });
  }
  if (stages.some(stage => stage.completed && !stage.criterion)) return json({ error: "완료된 단계에는 완료 조건을 입력해 주세요." }, 400);
  const ownerIds = [...new Set(stages.map(stage => stage.owner_id).filter((value): value is string => Boolean(value)))];
  if (ownerIds.length) {
    const members = await env.DB.prepare(`SELECT user_id FROM project_members WHERE project_id=? AND user_id IN (${ownerIds.map(() => "?").join(",")})`).bind(id, ...ownerIds).all<{ user_id: string }>();
    if (members.results.length !== ownerIds.length) return json({ error: "단계 담당자는 프로젝트 멤버여야 합니다." }, 400);
  }
  const now = new Date().toISOString();
  const plan = Object.fromEntries(fields.map(field => [field, (input[field] as string).trim()])) as Record<typeof fields[number], string>;
  await env.DB.prepare(`INSERT INTO project_plans (project_id,concept,target_users,release_scope,success_criteria,stages_json,updated_by_id,updated_at) VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(project_id) DO UPDATE SET concept=excluded.concept,target_users=excluded.target_users,release_scope=excluded.release_scope,success_criteria=excluded.success_criteria,stages_json=excluded.stages_json,updated_by_id=excluded.updated_by_id,updated_at=excluded.updated_at`)
    .bind(id, plan.concept, plan.target_users, plan.release_scope, plan.success_criteria, JSON.stringify(stages), context.user!.id, now).run();
  await recordAudit(request, "프로젝트 기획 수정", "project", id, "success", context.user!, null, { stages_completed: stages.filter(stage => stage.completed).length });
  return json({ ok: true, updated_at: now });
}
