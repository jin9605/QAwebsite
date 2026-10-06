import { env } from "cloudflare:workers";
import { getProjectAccess } from "../../../access";
import { getCurrentUser, recordAudit, unauthorized } from "../../../auth";
import { ensureTicketSchema } from "../../ticket-schema";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const categories = ["공통 정책", "게임 기획", "릴리즈/버전", "결정 기록"];
const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;
const MAX_SEARCH_LENGTH = 100;

const normalizeTags = (value: string) => [...new Set(value.split(",").map(tag => tag.trim()).filter(Boolean).slice(0, 10))].join(", ");

export async function GET(request: Request) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  const url = new URL(request.url);
  const keyword = (url.searchParams.get("q") || "").trim().slice(0, MAX_SEARCH_LENGTH);
  const category = (url.searchParams.get("category") || "").trim();
  const projectId = (url.searchParams.get("project_id") || "").trim();
  const documentId = (url.searchParams.get("id") || "").trim();
  const includeText = url.searchParams.get("include_text") === "1" && Boolean(documentId);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 100);
  if (category && !categories.includes(category)) return json({ error: "올바르지 않은 문서 분류입니다." }, 400);

  const search = `%${keyword.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const { results } = await env.DB.prepare(`SELECT documents.id,documents.title,documents.category,documents.project_id,documents.version,documents.tags,documents.source_file_name,${includeText ? "documents.text_content" : "NULL AS text_content"},documents.size,documents.created_by_name,documents.created_at,documents.updated_at,projects.name AS project_name
    FROM planning_documents documents
    LEFT JOIN projects ON projects.id=documents.project_id
    WHERE (documents.project_id IS NULL OR ?='admin' OR EXISTS (SELECT 1 FROM project_members members WHERE members.project_id=documents.project_id AND members.user_id=?))
      AND (?='' OR documents.category=?)
      AND (?='' OR documents.project_id=?)
      AND (?='' OR documents.id=?)
      AND (?='' OR documents.title LIKE ? ESCAPE '\\' OR documents.tags LIKE ? ESCAPE '\\' OR documents.text_content LIKE ? ESCAPE '\\')
    ORDER BY documents.updated_at DESC
    LIMIT ?`).bind(user.role, user.id, category, category, projectId, projectId, documentId, documentId, keyword, search, search, search, limit).all();
  return json({ documents: results });
}

export async function POST(request: Request) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  if (user.role === "viewer") return json({ error: "조회 전용 계정은 문서를 등록할 수 없습니다." }, 403);
  const body = await request.json() as Record<string, string>;
  const title = (body.title || "").trim();
  const category = (body.category || "").trim();
  const projectId = (body.project_id || "").trim();
  const sourceFileName = (body.source_file_name || "").trim();
  const rawHtml = body.raw_html || "";
  const textContent = (body.text_content || "").trim().slice(0, 300000);
  const size = new TextEncoder().encode(rawHtml).byteLength;
  if (!title || title.length > 150) return json({ error: "문서 제목은 1~150자로 입력해 주세요." }, 400);
  if (!categories.includes(category)) return json({ error: "문서 분류를 선택해 주세요." }, 400);
  if (!sourceFileName || !/\.html?$/i.test(sourceFileName)) return json({ error: "HTML 파일만 등록할 수 있습니다." }, 400);
  if (!rawHtml || !textContent) return json({ error: "내용이 없는 HTML 파일은 등록할 수 없습니다." }, 400);
  if (size > MAX_DOCUMENT_BYTES) return json({ error: "HTML 파일은 3MB 이하만 등록할 수 있습니다." }, 400);
  if (category === "게임 기획" && !projectId) return json({ error: "게임 기획 문서는 프로젝트를 연결해 주세요." }, 400);

  if (projectId) {
    const project = await env.DB.prepare("SELECT id FROM projects WHERE id=?").bind(projectId).first();
    if (!project) return json({ error: "프로젝트를 찾을 수 없습니다." }, 404);
    const access = await getProjectAccess(user, projectId);
    if (!access || access.role === "viewer") return json({ error: "이 프로젝트의 문서를 등록할 권한이 없습니다." }, 403);
  } else if (user.role !== "admin") {
    return json({ error: "공통 문서는 관리자만 등록할 수 있습니다." }, 403);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const objectKey = `planning/${id}/${sourceFileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await env.BUCKET.put(objectKey, rawHtml, { httpMetadata: { contentType: "text/html; charset=utf-8" } });
  await env.DB.prepare(`INSERT INTO planning_documents (id,title,category,project_id,version,tags,source_file_name,text_content,object_key,size,created_by_id,created_by_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, title, category, projectId || null, (body.version || "").trim().slice(0, 50) || null, normalizeTags(body.tags || ""), sourceFileName, textContent, objectKey, size, user.id, user.name, now, now).run();
  await recordAudit(request, "기획 문서 등록", "planning_document", id, "success", user, null, { title, category, project_id: projectId || null });
  return json({ id }, 201);
}
