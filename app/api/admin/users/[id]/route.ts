import { env } from "cloudflare:workers";
import { getCurrentUser, recordAudit, recordHistory, revokeUserSessions, unauthorized } from "../../../../auth";
import { ensureTicketSchema } from "../../../ticket-schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await ensureTicketSchema();
  const admin = await getCurrentUser(request);
  if (!admin) return unauthorized();
  if (admin.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const { id } = await params;
  const body = await request.json() as { status?: "approved" | "rejected"; role?: "admin" | "member" | "viewer"; action?: "revoke_sessions" };
  if (body.status && !["approved", "rejected"].includes(body.status)) return Response.json({ error: "잘못된 가입 상태입니다." }, { status: 400 });
  if (body.role && !["admin", "member", "viewer"].includes(body.role)) return Response.json({ error: "잘못된 권한입니다." }, { status: 400 });
  const before = await env.DB.prepare("SELECT id,name,email,role,status FROM users WHERE id=?").bind(id).first<{ id: string; role: string; status: string }>();
  if (!before) return Response.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 });
  if (body.action === "revoke_sessions") { await revokeUserSessions(id); await recordAudit(request, "사용자 세션 해제", "user", id, "success", admin); return Response.json({ ok: true }); }
  if (before.role === "admin" && body.role && body.role !== "admin") {
    if (before.id !== admin.id) return Response.json({ error: "다른 관리자의 등급은 변경할 수 없습니다." }, { status: 403 });
    const admins = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND status='approved'").first<{ count: number }>();
    if ((admins?.count || 0) < 2) return Response.json({ error: "승인된 관리자가 2명 이상일 때만 본인 등급을 변경할 수 있습니다." }, { status: 400 });
  }
  if (before.id === admin.id && body.status === "rejected") return Response.json({ error: "관리자는 본인의 승인을 해제할 수 없습니다." }, { status: 400 });
  await env.DB.prepare("UPDATE users SET status=COALESCE(?,status), role=COALESCE(?,role) WHERE id=?").bind(body.status || null, body.role || null, id).run();
  await recordHistory(admin, body.status === "approved" ? "회원 가입 승인" : body.status === "rejected" ? "회원 가입 거절" : "회원 권한 변경", null, before, body);
  await recordAudit(request, body.status === "approved" ? "회원 가입 승인" : body.status === "rejected" ? "회원 가입 거절" : "회원 권한 변경", "user", id, "success", admin, null, body);
  return Response.json({ ok: true });
}
