import type { Metadata } from "next";
import { requireUser } from "@/lib/access";
import AdminPanel from "@/components/admin-panel";

export const metadata: Metadata = {
  title: "Admin · ChaxterLog",
  description: "Verwaltung und Einstellungen für ChaxterLog",
  icons: {
    icon: "/admin-icon.svg",
    apple: "/admin-icon.svg",
  },
  robots: { index: false, follow: false },
};

export default async function Page() {
  await requireUser(true);
  return <AdminPanel />;
}
