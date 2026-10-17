import { requireUser } from "@/lib/access";
import AdminPanel from "@/components/admin-panel";
export const metadata = { robots: { index: false, follow: false } };
export default async function Page() { await requireUser(true); return <AdminPanel />; }
