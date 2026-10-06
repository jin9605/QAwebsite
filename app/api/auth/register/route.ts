import { env } from "cloudflare:workers";
import { createSalt, createSession, hashPassword, recordAudit, sessionCookie } from "../../../auth";
import { ensureTicketSchema } from "../../ticket-schema";

export async function POST(request: Request) {
  await ensureTicketSchema();
  const body = await request.json() as { name?: string; email?: string; password?: string };
  const name = (body.name || "").trim().slice(0, 50);
  const email = (body.email || "").trim().toLowerCase().slice(0, 254);
  const password = body.password || "";
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) return Response.json({ error: "이름, 회사 이메일, 8자 이상 비밀번호를 입력해 주세요." }, { status: 400 });
  if (await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first()) return Response.json({ error: "이미 가입 신청한 이메일입니다." }, { status: 409 });
  const firstUser = !((await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>())?.count);
  const configuredBootstrapToken = (env as unknown as { BOOTSTRAP_ADMIN_TOKEN?: string }).BOOTSTRAP_ADMIN_TOKEN;
  const bootstrap = Boolean(firstUser && configuredBootstrapToken && request.headers.get("x-bootstrap-admin-token") === configuredBootstrapToken);
  const id = crypto.randomUUID(), salt = createSalt(), now = new Date().toISOString();
  const role = bootstrap ? "admin" : "viewer", status = bootstrap ? "approved" : "pending";
  await env.DB.prepare("INSERT INTO users (id,name,email,role,status,password_hash,password_salt,created_at) VALUES (?,?,?,?,?,?,?,?)").bind(id,name,email,role,status,await hashPassword(password,salt),salt,now).run();
  await recordAudit(request, bootstrap ? "최초 관리자 등록" : "가입 신청", "user", id, "success", { id, name, email, role });
  if (!bootstrap) return Response.json({ pending: true }, { status: 201 });
  const headers = new Headers({ "set-cookie": sessionCookie(await createSession(id), request) });
  return Response.json({ user: { id, name, email, role } }, { status: 201, headers });
}
