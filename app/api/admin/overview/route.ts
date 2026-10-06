import { env } from "cloudflare:workers";
import { getCurrentUser, unauthorized } from "../../../auth";
import { ensureTicketSchema } from "../../ticket-schema";

export async function GET(request: Request) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  if (!user) return unauthorized();
  if (user.role !== "admin") return Response.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  const [users, logins, history, createdTickets, deletedTickets, auditLogs] = await Promise.all([
    env.DB.prepare("SELECT id,name,email,role,status,created_at,last_login_at FROM users ORDER BY created_at DESC").all(),
    env.DB.prepare("SELECT login_history.email,login_history.success,login_history.created_at,users.name FROM login_history LEFT JOIN users ON users.id=login_history.user_id ORDER BY login_history.created_at DESC LIMIT 100").all(),
    env.DB.prepare("SELECT ticket_history.actor_name,ticket_history.action,ticket_history.created_at,tickets.title FROM ticket_history LEFT JOIN tickets ON tickets.id=ticket_history.ticket_id WHERE ticket_history.action NOT IN ('댓글 등록','티켓 생성','휴지통 이동','티켓 완전 삭제') ORDER BY ticket_history.created_at DESC LIMIT 200").all(),
    env.DB.prepare("SELECT ticket_history.actor_name,ticket_history.action,ticket_history.created_at,tickets.title FROM ticket_history LEFT JOIN tickets ON tickets.id=ticket_history.ticket_id WHERE ticket_history.action='티켓 생성' ORDER BY ticket_history.created_at DESC LIMIT 200").all(),
    env.DB.prepare("SELECT ticket_history.actor_name,ticket_history.action,ticket_history.created_at,tickets.title FROM ticket_history LEFT JOIN tickets ON tickets.id=ticket_history.ticket_id WHERE ticket_history.action IN ('휴지통 이동','티켓 완전 삭제') ORDER BY ticket_history.created_at DESC LIMIT 200").all(),
    env.DB.prepare("SELECT actor_name,action,target_type,target_id,outcome,reason,ip_address,user_agent,created_at FROM audit_logs ORDER BY created_at DESC LIMIT 200").all(),
  ]);
  return Response.json({ users: users.results, logins: logins.results, history: history.results, createdTickets: createdTickets.results, deletedTickets: deletedTickets.results, auditLogs: auditLogs.results });
}
