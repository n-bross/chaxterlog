import Statistics from "@/components/statistics";
import { requireUser } from "@/lib/access";
export default async function Page() { await requireUser(); return <Statistics />; }
