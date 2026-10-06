import { env } from "cloudflare:workers";
import { getCurrentUser, unauthorized } from "../../../auth";
import { ensureTicketSchema } from "../../ticket-schema";

export async function GET(request: Request) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  if (user.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const tickets = await env.DB.prepare("SELECT id,title,deleted_at,deleted_by_name FROM tickets WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").all();
  return Response.json({ tickets: tickets.results });
}
