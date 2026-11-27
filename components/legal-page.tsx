import Link from "next/link";
import LegalLinks from "./legal-links";
import { operator } from "@/lib/legal/operator";

export function OperatorAddress() {
  return (
    <address>
      {operator.name}<br />{operator.strasse}<br />{operator.plzOrt}
    </address>
  );
}

export function OperatorContact() {
  return (
    <p>
      E-Mail: <a href={`mailto:${operator.email}`}>{operator.email}</a>
      {operator.telefon ? <><br />Telefon: {operator.telefon}</> : null}
    </p>
  );
}

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="manage-screen legal-screen">
      <header className="manage-header">
        <Link className="back-link" href="/">
          <span className="back-arrow" aria-hidden="true">←</span> Zurück
        </Link>
        <h1>{title}</h1>
        <span aria-hidden="true" />
      </header>
      <article className="legal-content">{children}</article>
      <LegalLinks />
    </main>
  );
}
