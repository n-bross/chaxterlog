import { redirect } from "next/navigation";
import { fetchAuthQuery, isAuthenticated } from "./auth-server";
import { api } from "@/convex/_generated/api";
export type Operator = { id: string; username: string; role: string };
export async function requireUser(adminOnly = false): Promise<Operator> {
  if (!await isAuthenticated()) redirect("/login");
  const user = await fetchAuthQuery(api.auth.currentUser, {});
  if (!user) redirect("/login");
  if (adminOnly && user.role !== "admin") redirect("/");
  return user;
}
