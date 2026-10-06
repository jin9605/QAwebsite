import { getCurrentUser } from "../../../auth";
import { ensureTicketSchema } from "../../ticket-schema";

export async function GET(request: Request) {
  await ensureTicketSchema();
  const user = await getCurrentUser(request);
  return user ? Response.json({ user }) : Response.json({ user: null });
}
