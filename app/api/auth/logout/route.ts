import { expiredSessionCookie, getCurrentUser, recordAudit, revokeCurrentSession } from "../../../auth";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  await revokeCurrentSession(request);
  await recordAudit(request, "로그아웃", "session", user?.id || null, "success", user);
  return Response.json({ ok: true }, { headers: { "set-cookie": expiredSessionCookie(request) } });
}
