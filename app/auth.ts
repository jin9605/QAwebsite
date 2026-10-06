import { env } from "cloudflare:workers";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member" | "viewer";
};

const SESSION_COOKIE = "qa_ticket_session";

const readCookie = (request: Request, name: string) => request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) || "";

const encoder = new TextEncoder();
const decode = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value));

export async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: decode(salt), iterations: 120000, hash: "SHA-256" }, key, 256);
  return encode(new Uint8Array(bits));
}

export const createSalt = () => encode(crypto.getRandomValues(new Uint8Array(16)));

const hashSessionToken = async (token: string) => encode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(token))));

export async function getCurrentUser(request: Request): Promise<CurrentUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const hashedToken = await hashSessionToken(token);
  return env.DB.prepare("SELECT users.id,users.name,users.email,users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token IN (?,?) AND sessions.expires_at>? AND users.status='approved'").bind(hashedToken, token, new Date().toISOString()).first<CurrentUser>();
}

export const unauthorized = () => Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

export async function createSession(userId: string) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token,user_id,expires_at,created_at) VALUES (?,?,?,?)").bind(await hashSessionToken(token), userId, expiresAt, new Date().toISOString()).run();
  return token;
}

export const sessionCookie = (token: string, request: Request) => `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
export const expiredSessionCookie = (request: Request) => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;

export async function revokeCurrentSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return;
  await env.DB.prepare("DELETE FROM sessions WHERE token IN (?,?)").bind(await hashSessionToken(token), token).run();
}

export async function revokeUserSessions(userId: string) {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(userId).run();
}

export async function recordAudit(request: Request, action: string, targetType: string, targetId: string | null, outcome: "success" | "failure", user: CurrentUser | null = null, reason: string | null = null, metadata: unknown = null) {
  const forwardedIp = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || null;
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) || null;
  await env.DB.prepare("INSERT INTO audit_logs (id,actor_id,actor_name,action,target_type,target_id,outcome,reason,ip_address,user_agent,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), user?.id || null, user?.name || null, action, targetType, targetId, outcome, reason, forwardedIp?.slice(0, 100) || null, userAgent, JSON.stringify(metadata), new Date().toISOString()).run();
}

export async function recordHistory(user: CurrentUser, action: string, ticketId: string | null, before: unknown = null, after: unknown = null) {
  await env.DB.prepare("INSERT INTO ticket_history (id,ticket_id,actor_id,actor_name,action,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), ticketId, user.id, user.name, action, JSON.stringify(before), JSON.stringify(after), new Date().toISOString()).run();
}
