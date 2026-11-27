import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { OperatorAddress, OperatorContact } from "@/components/legal-page";

export const metadata: Metadata = { title: "Impressum · ChaxterLog" };

// Öffentlich erreichbar: ruft bewusst kein requireUser() auf.
export default function Page() {
  return (
    <LegalPage title="Impressum">
      <p>Diese Website wird privat und ehrenamtlich für das Jugendforum Grafing betrieben.</p>

      <h2>Angaben gemäß § 5 DDG</h2>
      <OperatorAddress />

      <h2>Kontakt</h2>
      <OperatorContact />

      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <OperatorAddress />

      <h2>Haftung für Inhalte</h2>
      <p>
        Die Inhalte dieser Website werden mit größtmöglicher Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und
        Aktualität der Inhalte kann jedoch keine Gewähr übernommen werden. Als Diensteanbieter bin ich für eigene Inhalte nach
        den allgemeinen Gesetzen verantwortlich. Sobald mir eine Rechtsverletzung bekannt wird, entferne ich die betreffenden
        Inhalte umgehend.
      </p>

      <h2>Haftung für Links</h2>
      <p>
        Soweit diese Website Links zu externen Websites Dritter enthält, habe ich auf deren Inhalte keinen Einfluss. Für diese
        fremden Inhalte ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Zum Zeitpunkt der Verlinkung waren keine
        Rechtsverstöße erkennbar. Werden mir Rechtsverletzungen bekannt, entferne ich derartige Links umgehend.
      </p>

      <h2>Datenschutz</h2>
      <p>
        Informationen zur Verarbeitung personenbezogener Daten findest du in der <Link href="/datenschutz">Datenschutzerklärung</Link>.
      </p>
    </LegalPage>
  );
}
