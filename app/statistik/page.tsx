import Statistics from "@/components/statistics";
import { requireUser } from "@/lib/access";
export default async function Page() { const user = await requireUser(); return <Statistics isAdmin={user.role === "admin"} />; }
