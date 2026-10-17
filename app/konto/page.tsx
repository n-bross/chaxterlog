import { requireUser } from "@/lib/access";
import Account from "@/components/account";
export default async function Page() { return <Account user={await requireUser()} />; }
