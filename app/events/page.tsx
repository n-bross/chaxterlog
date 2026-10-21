import Link from "next/link";
import EventsManager from "@/components/events-manager";
import { requireUser } from "@/lib/access";

export default async function Page() {
  await requireUser();
  return (
    <main className="manage-screen events-screen">
      <header className="manage-header">
        <Link className="back-link" href="/">
          <span className="back-arrow" aria-hidden="true">←</span> Zählung
        </Link>
        <h1>Events</h1>
        <span aria-hidden="true" />
      </header>
      <EventsManager />
    </main>
  );
}
