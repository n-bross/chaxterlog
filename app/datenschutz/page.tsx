import type { Metadata } from "next";
import LegalPage, { OperatorAddress, OperatorContact } from "@/components/legal-page";
import { LEGAL_STAND } from "@/lib/legal/operator";

export const metadata: Metadata = { title: "Datenschutz · ChaxterLog" };

// Öffentlich erreichbar: ruft bewusst kein requireUser() auf.
export default function Page() {
  return (
    <LegalPage title="Datenschutz">
      <p>
        ChaxterLog ist die Besucherzählung des Schülercafés Grafing. Die App wird nur vom Team genutzt; Besucherinnen und
        Besucher des Cafés werden ausschließlich anonym gezählt. Hier erfährst du, welche Daten dabei verarbeitet werden.
      </p>

      <h2>1. Verantwortlicher</h2>
      <OperatorAddress />
      <OperatorContact />
      <p>
        Die App wird privat und ehrenamtlich für das Jugendforum Grafing betrieben. Ein Datenschutzbeauftragter ist nicht
        benannt, da hierfür keine gesetzliche Pflicht besteht.
      </p>

      <h2>2. Hosting und Server-Logfiles</h2>
      <p>
        Die Website wird bei der Vercel Inc., 440 N Barranca Ave #4133, Covina, CA 91723, USA, gehostet; die Serverfunktionen
        laufen in der Region Frankfurt am Main (fra1). Beim Aufruf verarbeitet Vercel automatisch technisch notwendige Daten in
        Server-Logfiles: IP-Adresse, Datum und Uhrzeit, aufgerufene Seite, HTTP-Statuscode, Browser/Betriebssystem
        (User-Agent) und ggf. die zuvor besuchte Seite (Referrer).
      </p>
      <p>
        Zweck ist die sichere und stabile Auslieferung der Website; Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Vercel ist
        Auftragsverarbeiter (Art. 28 DSGVO). Eine Übermittlung in die USA ist nicht ausgeschlossen; Vercel ist unter dem EU-US
        Data Privacy Framework zertifiziert (Angemessenheitsbeschluss, Art. 45 DSGVO). Die Logfiles werden von Vercel nur für
        einen begrenzten Zeitraum gespeichert und danach automatisch gelöscht.
      </p>

      <h2>3. Datenbank (Convex)</h2>
      <p>
        Die Daten der App werden bei der Convex, Inc. (USA) gespeichert, in der Datenregion eu-west-1 (Irland). Convex ist
        Auftragsverarbeiter (Art. 28 DSGVO). Soweit dabei ein Zugriff aus den USA möglich ist, erfolgt er auf Grundlage des
        EU-US Data Privacy Framework bzw. von EU-Standardvertragsklauseln (Art. 46 DSGVO).
      </p>

      <h2>4. Besucherzählung</h2>
      <p>
        Pro Besuch wird nur gespeichert, ob die Person unter oder über 15 Jahre alt ist (U15/Ü15), dazu Datum und Uhrzeit.
        Es werden <strong>keine Namen, Fotos oder sonstigen Angaben zu Besucherinnen und Besuchern</strong> erfasst. Diese
        Zählungen sind keine personenbezogenen Daten. Zur Nachvollziehbarkeit wird zu jedem Eintrag vermerkt, welches
        Teammitglied und welches Gerät ihn erfasst oder korrigiert hat (siehe Nr. 5).
      </p>

      <h2>5. Konten des Teams und Anmeldung</h2>
      <p>
        Nur Teammitglieder haben ein Konto; Konten werden von der Administration angelegt, eine Selbstregistrierung gibt es
        nicht. Verarbeitet werden:
      </p>
      <ul>
        <li>Benutzername und Rolle, Passwort (nur als Hash), ggf. Daten zur Zwei-Faktor-Anmeldung (TOTP-Geheimnis, Backup-Codes);</li>
        <li>Sitzungen mit IP-Adresse und User-Agent des Geräts sowie Zeitpunkt und Ablaufdatum;</li>
        <li>IP-basierte Zähler zur Begrenzung von Anmeldeversuchen (Schutz vor dem Erraten von Passwörtern);</li>
        <li>Geräte, mit denen gezählt wird (zufällige Geräte-ID, Gerätename, Plattform/Browser, zuletzt gesehen, zuletzt angemeldetes Teammitglied);</li>
        <li>Protokoll der erfassten und korrigierten Zählungen sowie angelegter Events (wer, wann, auf welchem Gerät);</li>
        <li>persönliche QR-Anmeldecodes (nur als Hash, höchstens 180 Tage gültig, jederzeit widerrufbar);</li>
        <li>persönliche Zugangstokens für Kurzbefehle/Widgets (nur als Hash, mit Name, Gerät und Zeitpunkt der letzten Nutzung);</li>
        <li>freiwillig gesendete Diagnoseberichte (Problembeschreibung, App-Version, Gerätename, User-Agent, Bildschirmgröße, Zeitzone, Verbindungsart und noch nicht synchronisierte Zählungen).</li>
      </ul>
      <p>
        <strong>Zweck:</strong> Bereitstellung der App für das Team, sichere Anmeldung, Nachvollziehbarkeit und Korrektur der
        Zählungen, Fehlerbehebung. <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (Nutzung der App im Rahmen der
        ehrenamtlichen Mitarbeit) und Art. 6 Abs. 1 lit. f DSGVO (Sicherheit des Systems, Missbrauchsschutz).{" "}
        <strong>Empfänger:</strong> Vercel und Convex als Auftragsverarbeiter; innerhalb des Teams sehen Administratorinnen und
        Administratoren die Protokolle und Diagnoseberichte.
      </p>
      <p>
        <strong>Speicherdauer:</strong> Sitzungen laufen nach 30 Tagen ab. Kontodaten werden gelöscht, wenn das Konto entfernt
        wird; Protokolleinträge, Diagnoseberichte und Zugangstokens, sobald sie nicht mehr benötigt werden bzw. das Konto
        gelöscht wird.
      </p>

      <h2>6. Cookies</h2>
      <p>Die App setzt ausschließlich technisch notwendige Cookies für die Anmeldung (bei HTTPS mit dem Präfix <code>__Secure-</code>):</p>
      <ul>
        <li><code>better-auth.session_token</code> – hält dich angemeldet; Laufzeit 30 Tage, verlängert sich bei Nutzung.</li>
        <li><code>better-auth.convex_jwt</code> – kurzlebiger Zugangsschlüssel zur Datenbank; Laufzeit 15 Minuten.</li>
        <li><code>better-auth.two_factor</code> – nur während einer Anmeldung mit Zwei-Faktor-Code; Laufzeit 10 Minuten.</li>
      </ul>
      <p>
        Diese Cookies sind für den von dir gewünschten Dienst (Anmeldung) unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG); eine
        Einwilligung ist nicht nötig. Es gibt keine Analyse-, Tracking- oder Werbe-Cookies.
      </p>

      <h2>7. Lokale Speicherung im Browser und Offline-Betrieb</h2>
      <p>
        Damit auch ohne Internetverbindung gezählt werden kann, speichert die App Zählungen zunächst im lokalen Speicher des
        Browsers (localStorage, Einträge <code>chaxterlog:event:…</code>) und überträgt sie, sobald eine Verbindung besteht.
        Außerdem werden dort die zufällige Geräte-ID und der Gerätename (<code>chaxterlog:device:v1</code>) sowie im
        Sitzungsspeicher ein Hinweis auf laufende App-Updates abgelegt. Diese Speicherung ist für die Funktion der App unbedingt
        erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Du kannst die Daten über die Browsereinstellungen löschen; noch nicht übertragene
        Zählungen gehen dabei verloren.
      </p>

      <h2>8. Anmeldung per QR-Code (Kamera)</h2>
      <p>
        Bei der Anmeldung per QR-Code fragt der Browser nach Zugriff auf die Kamera. Das Kamerabild wird ausschließlich lokal im
        Browser ausgewertet, um den QR-Code zu erkennen; es wird weder gespeichert noch übertragen. Übertragen wird nur der im
        QR-Code enthaltene Anmeldecode. Sobald ein Code erkannt oder das Fenster geschlossen wird, wird die Kamera
        beendet. Den Kamerazugriff kannst du in den Browsereinstellungen jederzeit widerrufen.
      </p>

      <h2>9. Schriftarten</h2>
      <p>
        Die Schriftarten werden zusammen mit der App von unserem Hosting-Anbieter ausgeliefert; es werden keine Verbindungen zu
        Google oder anderen Drittanbietern aufgebaut.
      </p>

      <h2>10. Deine Rechte</h2>
      <ul>
        <li>Auskunft (Art. 15 DSGVO)</li>
        <li>Berichtigung (Art. 16 DSGVO)</li>
        <li>Löschung (Art. 17 DSGVO)</li>
        <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
        <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
        <li>Widerruf einer erteilten Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO)</li>
      </ul>
      <p>
        <strong>Widerspruchsrecht (Art. 21 DSGVO):</strong> Soweit Daten auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO verarbeitet
        werden, kannst du aus Gründen, die sich aus deiner besonderen Situation ergeben, jederzeit widersprechen. Eine formlose
        Nachricht an die oben genannte E-Mail-Adresse genügt.
      </p>

      <h2>11. Beschwerderecht bei der Aufsichtsbehörde</h2>
      <p>
        Du hast das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren. Zuständig ist das Bayerische Landesamt für
        Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach,{" "}
        <a href="https://www.lda.bayern.de" target="_blank" rel="noopener noreferrer">www.lda.bayern.de</a>.
      </p>

      <h2>Stand</h2>
      <p>{LEGAL_STAND}</p>
    </LegalPage>
  );
}
