import type { Metadata } from "next";
import Kasse from "@/components/kasse";
import { requireUser } from "@/lib/access";
export const metadata: Metadata = { title: "Kasse · ChaxterLog" };
export default async function Page() { return <Kasse user={await requireUser()} />; }
