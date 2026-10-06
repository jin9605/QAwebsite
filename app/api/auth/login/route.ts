import { env } from "cloudflare:workers";
import { createSession, getCurrentUser, hashPassword, recordAudit, sessionCookie } from "../../../auth";
import { ensureTicketSchema } from "../../ticket-schema";

export async function POST(request: Request) {
  await ensureTicketSchema();
  const body = await request.json() as { email?: string; password?: string };
  const email = (body.email || "").trim().toLowerCase().slice(0, 254);
  const password = body.password || "";
  const now = new Date().toISOString();
  const ipAddress = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "";
  const recentFailures = await env.DB.prepare("SELECT COUNT(*) AS count FROM login_history WHERE email=? AND success=0 AND created_at>? AND COALESCE(ip_address,'')=?").bind(email, new Date(Date.now() - 15 * 60 * 1000).toISOString(), ipAddress.slice(0, 100)).first<{ count: number }>();
  if ((recentFailures?.count || 0) >= 5) {
    await recordAudit(request, "로그인", "user", null, "failure", null, "로그인 시도 횟수 제한", { email });
    return Response.json({ error: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요." }, { status: 429 });
  }
  const user = await env.DB.prepare("SELECT id,name,email,role,status,password_hash,password_salt FROM users WHERE email=?").bind(email).first<{ id: string; name: string; email: string; role: "admin" | "member" | "viewer"; status: string; password_hash: string | null; password_salt: string | null }>();
  const success = Boolean(user && user.status === "approved" && user.password_hash && user.password_salt && password.length >= 8 && await hashPassword(password, user.password_salt) === user.password_hash);
  const reason = !user ? "등록되지 않은 이메일" : user.status !== "approved" ? "승인되지 않은 계정" : "비밀번호 불일치";
  await env.DB.prepare("INSERT INTO login_history (id,user_id,email,success,ip_address,user_agent,reason,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(), user?.id || null, email, success ? 1 : 0, ipAddress.slice(0, 100), request.headers.get("user-agent")?.slice(0, 500) || null, success ? null : reason, now).run();
  if (!success) { await recordAudit(request, "로그인", "user", user?.id || null, "failure", null, reason, { email }); return Response.json({ error: user?.status === "pending" ? "관리자 승인 대기 중입니다." : "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 }); }
  await env.DB.prepare("UPDATE users SET last_login_at=? WHERE id=?").bind(now, user.id).run();
  const currentUser = await getCurrentUser(new Request(request.url, { headers: { cookie: "" } })) || { id: user.id, name: user.name, email: user.email, role: user.role };
  await recordAudit(request, "로그인", "user", user.id, "success", currentUser);
  const headers = new Headers({ "set-cookie": sessionCookie(await createSession(user.id), request) });
  return Response.json({ user }, { headers });
}
