import Counter from "@/components/counter";
import { requireUser } from "@/lib/access";
export default async function Home() { return <Counter user={await requireUser()} />; }
