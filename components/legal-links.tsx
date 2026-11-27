import Link from "next/link";

export default function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav className={`legal-links ${className}`.trim()} aria-label="Rechtliches">
      <Link href="/impressum">Impressum</Link>
      <span aria-hidden="true">·</span>
      <Link href="/datenschutz">Datenschutz</Link>
    </nav>
  );
}
