import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type Operator = { id: string; username: string; role: string };
export async function sessionFor(request: Request) {
  return auth.api.getSession({ headers: request.headers });
}
export async function requireUser(adminOnly = false): Promise<Operator> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  if (adminOnly && session.user.role !== "admin") redirect("/");
  return { id: session.user.id, username: session.user.username ?? session.user.name, role: session.user.role ?? "user" };
}
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(process.env.BETTER_AUTH_URL ?? request.url).origin;
}
