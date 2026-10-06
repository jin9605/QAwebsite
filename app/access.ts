import { env } from "cloudflare:workers";
import type { CurrentUser } from "./auth";

export const PROJECT_ROLES = ["project_admin", "qa", "developer", "viewer"] as const;
export type ProjectRole = typeof PROJECT_ROLES[number];
export type ProjectAccess = { role: ProjectRole };

export async function getProjectAccess(user: CurrentUser, projectId: string): Promise<ProjectAccess | null> {
  if (user.role === "admin") return { role: "project_admin" };
  return env.DB.prepare("SELECT role FROM project_members WHERE project_id=? AND user_id=?").bind(projectId, user.id).first<ProjectAccess>();
}

export async function canAccessProject(user: CurrentUser, projectId: string) {
  return Boolean(await getProjectAccess(user, projectId));
}

export const canCreateTicket = (access: ProjectAccess | null) => Boolean(access && access.role !== "viewer");
export const canChangeTicketFields = (access: ProjectAccess | null) => Boolean(access && (access.role === "project_admin" || access.role === "qa"));
export const canComment = (access: ProjectAccess | null) => Boolean(access && access.role !== "viewer");

export function canTransitionStatus(access: ProjectAccess | null, from: string, to: string, isAssignee: boolean) {
  if (!access || access.role === "viewer") return false;
  if (access.role === "project_admin" || access.role === "qa") return true;
  return isAssignee && ((from === "신규" && to === "진행") || (from === "진행" && to === "완료") || from === to);
}
