<p align="center">
  <img src="assets/logo.png" alt="ChaxterLog Logo" width="160" />
</p>

# ChaxterLog

Besucherzählung für das Schülercafé Grafing (Chaxter): Next.js 16 App Router, React 19, TypeScript, Tailwind CSS und **Convex** mit Better Auth. Mehrere Browser teilen sich die Zählung in Echtzeit. Die Datenbank beginnt frisch; frühere Daten und Benutzer werden nicht übernommen.

## Einrichtung und Entwicklung

```bash
npm install
npx convex dev
```

Mit dem Convex-Konto anmelden und ein neues Projekt anlegen. `convex dev` richtet die Entwicklungsdatenbank ein, installiert die lokale Better-Auth-Komponente und erzeugt `convex/_generated` sowie `convex/betterAuth/_generated`. Diese generierten Typen gehören ins Repository. Der Prozess bleibt während der Entwicklung geöffnet.

`.env.local` anhand von `.env.example` vervollständigen:

```dotenv
CONVEX_DEPLOYMENT=dev:DEIN_DEPLOYMENT
NEXT_PUBLIC_CONVEX_URL=https://DEIN_DEPLOYMENT.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://DEIN_DEPLOYMENT.convex.site
NEXT_PUBLIC_SITE_URL=http://localhost:3002
SITE_URL=http://localhost:3002
```

`NEXT_PUBLIC_CONVEX_SITE_URL` ist die HTTP-Actions-Adresse mit `.site`, nicht die `.cloud`-Adresse. `SITE_URL` in der lokalen Datei wird vom Einrichtungsskript verwendet. Die Auth-Konfiguration läuft in Convex und benötigt dort ihre eigenen Variablen:

```bash
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL http://localhost:3002
npm run dev -- --port 3002
```

`SITE_URL` in Convex muss exakt zur Website-Origin einschließlich Port passen. Für jeden Worktree eine eigene ignorierte `.env.local` verwenden. Zugangsschlüssel, `.env.local`, `.convex/` und `.vercel/` werden nicht eingecheckt. Entwicklung und Produktion verwenden getrennte Convex-Deployments mit eigenen Benutzern und Zählerständen.

Die Integration folgt der [offiziellen Next.js-Anleitung](https://labs.convex.dev/better-auth/framework-guides/next). Der [lokale Komponentenaufbau](https://labs.convex.dev/better-auth/features/local-install) ergänzt das Auth-Schema um die Felder und Indizes des Admin-Plugins. Better Auth ist auf eine unterstützte, gepatchte 1.6.x-Version festgelegt; bei Updates Peer-Abhängigkeiten und Komponenten-Schema gemeinsam prüfen.

## Erster Admin

Nach dem ersten erfolgreichen `convex dev`:

```bash
node --env-file=.env.local scripts/setup-admin.mjs
```

Der zufällige Einmallink steht ausschließlich in `.vercel/admin-setup-link.txt`. Im Browser öffnen und das Passwort für `admin` festlegen. Das Token liegt im URL-Fragment und wird erst beim Absenden übertragen; in der Datenbank liegt nur sein SHA-256-Hash. Der Link gilt sieben Tage. Vor Abschluss darf das Skript einen Ersatzlink erzeugen; danach verweigert es jede weitere Einrichtung.

Prüfung, Benutzeranlage und Verbrauch des Tokens laufen in einer Convex-Transaktion einschließlich der Auth-Komponente. Gleichzeitige Einlösungen können daher nur einen ersten Admin erzeugen. Ein vorhandener Admin oder eine abgeschlossene Einrichtung blockiert das Bootstrap-Verfahren dauerhaft. Es gibt keinen öffentlichen Aufruf zum Erzeugen eines Einrichtungstokens; `setup:prepare` ist eine interne Funktion und benötigt die Convex-CLI mit Deployment-Zugriff. Link vertraulich behandeln und nach Verwendung entfernen. Eine spätere Admin-Wiederherstellung benötigt administrativen Zugriff auf das Convex-Deployment.

## Anmeldung und Rollen

- Anmeldung mit **Benutzername und Passwort**, ohne E-Mail-Eingabe, E-Mail-Versand oder öffentliche Registrierung. E-Mail-Anmeldung und öffentliche Profiländerungen sind deaktiviert.
- Better Auth benötigt intern eine zufällige Adresse unter `chaxter.invalid`; sie ist keine echte E-Mail-Adresse und wird nicht angezeigt.
- Better Auth hasht Passwörter. Sitzungen liegen in der Convex-Auth-Komponente, Cookies sind HttpOnly und über HTTPS Secure. Sitzungen gelten höchstens 30 Tage. Benutzername-Anmeldung erlaubt fünf Versuche pro Minute und IP; das Limit wird in Convex gespeichert. Alle Geräte im Café-WLAN teilen sich eine öffentliche IP. Token- und Sitzungsabfragen (`/convex/token`, `/get-session`) haben deshalb ein großzügiges eigenes Limit, und Convex' Schlüsselabruf (`/convex/jwks`) ist ausgenommen.
- `/`, `/statistik` und `/konto` sind serverseitig geschützt. `/admin` prüft zusätzlich die Admin-Rolle und leitet Mitarbeiter zur Zählung zurück. Jede öffentliche Convex-Datenfunktion prüft die Sitzung; jede Admin-Funktion und jeder Export prüft die Rolle erneut anhand des aktuellen Auth-Benutzers. Gesperrte Benutzer werden auch mit noch vorhandenem JWT abgewiesen.
- Der Admin-Link steht ausschließlich bei Admins unter Konto. Admins erstellen Mitarbeiter, sperren und entsperren sie oder setzen ihr Passwort zurück. Sperren und Passwortreset beenden bestehende Sitzungen.
- Unter Konto ändert jeder Benutzer sein Passwort; andere Sitzungen dieses Kontos werden beendet. Ohne E-Mail gibt es keinen E-Mail-Passwortreset.
- Beim Abmelden müssen alle offenen Klicks erfolgreich synchronisiert sein. Ein Kontowechsel ordnet fremde offene Klicks oder Korrekturen niemals stillschweigend neu zu; Anmeldung und Upload prüfen die Zuordnung. Bei einer Konfliktmeldung mit dem ursprünglichen Konto anmelden.

## Zählen, Datum und Statistik

Zwei große Buttons zählen U15/Ü15. Die Tagesgesamtzahl steht oben mittig, Statistik links und die Datumsauswahl rechts. Neue Klicks verwenden den tatsächlichen Zeitpunkt und wechseln zur heutigen Ansicht zurück. Die Gruppengrenze genau 15-jähriger Besucher muss fachlich festgelegt werden. Gezählt werden Besuche, keine eindeutig identifizierten Besucher.

Undo und Redo stehen als große Buttons nebeneinander. Beide sind bei früheren Tagen deaktiviert. Undo storniert den neuesten noch gezählten Besuch des heutigen Tages im lokal bekannten gemeinsamen Stand. Offline kennt ein Browser nur die zuletzt empfangenen Korrekturziele und seine lokalen Klicks, keine inzwischen hinzugekommenen Besuche anderer Geräte.

Die Statistik bietet Tag, Woche (Montag–Sonntag), Monat, Jahr, freien Zeitraum und Gesamt sowie Verlauf, Stundenverteilung, Wochentagsdurchschnitte und eine Besuchsliste. Beste Wochentage beruhen auf Durchschnitten je Tag mit aktiven Besuchen. Nicht erfasste Öffnungstage sind unbekannt. Gleichstände bleiben sichtbar; unter sieben erfassten Tagen wird auf eine erste Tendenz hingewiesen. Zeitzone und Tagesgrenzen sind durchgehend **Europe/Berlin**, einschließlich Sommer-/Winterzeit.

Statistikwerte sind eine Momentaufnahme beim Laden bzw. beim Zeitraumwechsel. Einzelbesuche und Undo-/Redo-Protokoll laden erst beim Öffnen des Aktivitätsprotokolls, jeweils mit maximal 50 Einträgen pro Serverseite. Das Korrekturprotokoll filtert nach dem Zeitpunkt der Aktion, Besuchslisten nach dem ursprünglichen Besuchsdatum. Die Liste zeigt Benutzer, Gerätename beim Klick und grobe Plattform/Browserkennung. Alte lokale Klicks ohne Benutzerzuordnung bleiben als Altbestand erkennbar.

## Echtzeit und persistente Offline-Warteschlange

- Jeder Klick wird **vor** der sichtbaren Erhöhung synchron in localStorage gespeichert: UUID, ISO-Zeitstempel und die beim Klick angemeldete Person. Eine fehlgeschlagene Speicheroperation erhöht die Zählung nicht. Ein separater Schlüssel je Klick verhindert, dass Tabs verschiedene Klicks überschreiben.
- Die einzige dauerhafte fachliche Live-Abfrage der Zählseite ist `visits:live`: Tageszähler, Revisionsnummer/Datenbankkennung und höchstens drei kleine Korrekturziele (neuester aktiver U15-/Ü15-Besuch sowie letzter noch nicht wiederhergestellter Besuch). Es gibt weder eine Besuchslisten-Subscription noch einen Download des gesamten Bestands.
- Convex überträgt Änderungen über seine Verbindung. Der Besuchssync hat **keine Polling-Schleife**. Die globale Queue sendet beim Laden, bei neuen Klicks, Online-Rückkehr, Wiederverbindung, Fokus und wieder sichtbarer Seite. Bei einem Fehler bleibt sie erhalten und wartet auf den nächsten dieser Auslöser. Der Status zeigt offene Klicks, erfolgreichen Abgleich, Offline-Betrieb oder einen Benutzerkonflikt.
- UUIDs werden über einen Index transaktional dedupliziert. Eine Stornierung bleibt permanent, auch wenn ein alter Offline-Upload später ankommt. Redo erstellt einen Ersatz mit deterministischer UUID v5 und `redoOf`; gleiche Redos verschiedener Geräte zählen daher nur einmal. Der ursprüngliche Besuchszeitpunkt bleibt erhalten, der wiederherstellende Benutzer und sein Gerät gehören zum Ersatz.
- Die Queue sendet abhängige Redos nach ihren Ursprüngen; Stapel sind auf 100 Besuche und ungefähr 110 KB JSON begrenzt. Mutationen bestätigen nur IDs, Stornierungsstatus und Tagesrevisionen. Lokale Änderungen während einer laufenden Übertragung bleiben unbestätigt in der Queue. Revisionen halten die optimistische Anzeige bis zum passenden Serverstand aufrecht.
- Beim Empfang eines Tagesstands bleiben für diesen Tag nur offene Einträge und die aktuellen Korrekturziele im lokalen Besuchscache. Alte bestätigte lokale Daten werden durch den neuen Tagesstand ersetzt, nicht in die frische Datenbank importiert. Alte, noch nicht bestätigte lokale Klicks ohne Benutzer werden mit ursprünglicher UUID und Zeit als Altbestand hochgeladen. Offene Einträge alter, nicht übernommener Benutzer können keinem neuen Konto automatisch zugeordnet werden; vor dem Wechsel zur frischen Installation solche Einträge sichern bzw. die alte Installation abschließen.
- Browserdaten nicht löschen, solange Klicks offen sind. Andere Website-Adressen und Browser haben getrennte lokale Speicher. Die App benötigt beim Laden/Neuladen eine Verbindung; eine bereits geladene Seite kann offline weiter zählen. Es gibt keinen Service Worker und keine garantierte Offline-Neuladung.

## Speicher- und Bandbreitendesign

Convex sendet bei Änderungen das vollständige Ergebnis einer reaktiven Abfrage neu. Deshalb bleiben die Live-Ergebnisse klein; Auth-Sitzung/Verbindung sind die einzigen zusätzlichen laufenden Auth-Abfragen. Statistik, Events, Event-Auswertung, Protokolle, Admin-Listen und Exporte verwenden einmalige Abfragen bei Bedarf. Geschlossene Statistikabschnitte laden ihre Listen nicht.

Tabellen und Zugriffswege:

- `visits`: UUID, Berliner Datum, Gruppe, Zeit/Reihenfolge, Benutzer und permanenter Stornierungs-/Redo-Status. Indizes auf UUID, Datum/Reihenfolge, aktive Besuche nach Datum/Gruppe sowie verfügbare Redos nach Datum/Undo-Reihenfolge.
- `dailyCounts`: ein kleiner Zähler je Berliner Datum (U15, Ü15, Stornierungen, Revision); eindeutiger Zugriff über Datumsindex.
- `dailyHours`: getrennte kompakte Arrays mit je 24 Stundenwerten für U15 und Ü15, ebenfalls über Datum. Sie gehören bewusst nicht zur Live-Abfrage. Beide Aggregate werden in derselben Transaktion wie Besuche gepflegt. Statistik und Event-Auswertung lesen diese Aggregate, niemals den gesamten Besuchsbestand.
- `corrections`: eine unveränderliche Aktion je UUID mit Zielbesuch, Bedienzeit, Serverempfang, Benutzer und Gerät. Indizes auf UUID, Aktionsdatum/Reihenfolge und Zielbesuch.
- `devices`: eine Browserinstallation je UUID, aktueller Name, Plattform, letzter Upload und Benutzer; UUID- und Letzt-gesehen-Index. Besuche/Korrekturen referenzieren das Gerät und speichern nur einen auf 40 Zeichen begrenzten Namens-Snapshot für historische Namen. Plattformangaben werden aus dem Gerät gelesen, nicht bei jedem Klick dupliziert.
- `events`: UUID- und Datumsindex. `support`: begrenzte Diagnoseberichte (höchstens 20 KB) mit Erstellungsindex, vom Admin löschbar. `setup`: einzelner Admin-Einrichtungsdatensatz mit Schlüsselindex.
- Die lokale offizielle Better-Auth-Komponente enthält Benutzer, Konten, Sitzungen, Rate-Limit- und Schlüsselmaterial mit den benötigten Indizes einschließlich Rolle und Benutzername. Passwörter und Sitzungen werden nicht exportiert.

Wachsende Listen verwenden indexbasierte Cursor-Seiten (Besuche/Korrekturen/Admin je 50, Events/Aggregate/Export je 100). Gesamtstatistik und Event-Analyse laden bei Bedarf mehrere Aggregat-/Eventseiten. Es gibt keine unbeschränkten `.collect()`-Abfragen auf Besuchstabellen. Die Nutzung des kostenlosen Tarifs hängt weiter von Geräten, Klickzahl, Öffnungsdauer und Exporten ab; eine feste Bandbreitengarantie ist damit nicht verbunden.

## Undo, Redo und Korrekturprotokoll

**Tippen:** +1. **Lange gedrückt halten (500 ms):** neuesten aktiven Besuch der gewählten Gruppe von heute stornieren. Ladebalken, rotes −1-Badge, Vibration und Schüttelanimation geben Feedback. Am Desktop funktionieren auch Shift+Klick und Alt+Klick. Diese Aktion erzeugt ein reguläres Undo und lässt sich per Redo wiederherstellen.

Redo stellt den zuletzt zurückgenommenen, noch nicht wiederhergestellten Besuch von heute wieder her. Neue Zählklicks löschen die Möglichkeit nicht. Undo-/Redo-Ketten lassen sich fortsetzen und bleiben nach Neuladen verfügbar. Jeder tatsächlich verwendete Korrekturknopf erhält eine eigene UUID mit Typ, lokalem Bedienzeitpunkt, authentifiziertem Benutzer, Gerät und Serverempfang. Retries erzeugen keinen zusätzlichen Protokolleintrag. Gleichzeitige Redos können mehrere Bedienaktionen protokollieren, aber nur einen Besuch wiederherstellen.

Die Queue speichert Korrektur und Besuch in einem lokalen Schreibvorgang. Serverantworten dürfen neuere lokale Aktionen nicht entfernen. Im Aktivitätsprotokoll unter **Undo & Redo** stehen 50 Aktionen je Seite. Statistikwerte berücksichtigen nur aktive Besuche; Protokolle bleiben bei weiteren Korrekturen erhalten. Admin-CSV und JSON enthalten diese Aktionen ebenfalls.

## Geräte, Events und Support

Die zufällige Geräte-UUID in localStorage identifiziert eine **Browserinstallation**, keine Hardware. Unter Konto lässt sich beispielsweise „Kasse Tablet“ vergeben. Historische Gerätenamen bleiben am Klick erhalten. Der Admin sieht Gerätekennung, aktuellen Namen, Plattform, letzten Upload und letzten Benutzer. Betriebssystem und Browser werden bestmöglich erkannt; es gibt keine Hardware-Seriennummern, IMEI oder GPS-Ortung.

Events können über die Zählseite oder Statistik angelegt und bearbeitet werden, einschließlich Beschreibung, Datum und Import aus ICS, CSV oder eingefügtem Excel-Text. Mitarbeiter dürfen Events verwalten. Die Event-Auswertung ordnet die Tagesaggregate den Eventtagen zu und vergleicht einzelne Events sowie Kategorien. Mehrere Events am selben Tag teilen sich dessen Besucherzahlen; einzelne Besuche werden keinem konkreten Event zugeordnet.

Unter Konto lässt sich ein Diagnosebericht mit Problembeschreibung, Browser-/Systemdaten, lokalem Tagesstand und einer begrenzten Auswahl offener Queue-Einträge senden. Nur der Admin sieht die Meldungen und kann sie abschließen oder löschen. Berichte laden ausschließlich im Admin-Bereich bei Bedarf.

## Admin-Export

Unter `/admin` oder über den Download in der Statistik wählt der Admin einen Datumsbereich (inklusive, Berlin-Zeit) oder den gesamten Bestand:

- **Einzelbesuche CSV:** Datum, Zeit, Gruppe, Status, Benutzer, Gerät, Plattform, Altbestand/Import, Stornierung und Redo-Verknüpfung; einschließlich Stornierungen.
- **Tageswerte CSV:** U15, Ü15 und Gesamt aus den Tagesaggregaten.
- **JSON:** Besuche einschließlich Stornierungen/Metadaten und `corrections`, ohne Passwörter/Sitzungen.
- **Undo & Redo · CSV:** Korrekturen nach Aktionszeitraum, einschließlich Bediengerät und Serverempfang. Besuchsexporte filtern dagegen nach Besuchszeitraum.

`GET /api/admin/export?format=csv|daily|json|corrections&from=YYYY-MM-DD&to=YYYY-MM-DD` ist die verbleibende Download-Route. Sie prüft die Admin-Rolle serverseitig und ruft zusätzlich Admin-geschützte Convex-Abfragen mit dem Sitzungstoken auf. Der Download wird aus begrenzten Seiten gestreamt; Änderungen während eines langen Exports können zwischen Seiten sichtbar werden. CSV verwendet UTF-8 mit BOM, Semikolon, korrektes Quoting und Schutz vor Tabellenformeln. Downloads sind nicht cachebar. Grafikexporte der Statistik bleiben lokal im Browser möglich.

## Prüfung und Deployment

```bash
npm install
npm test
npm run typecheck
npm run build
# Mit eingerichtetem Entwicklungsdeployment:
npx convex dev --once --typecheck enable --typecheck-components
```

`npm test` führt zuerst die Pure-Logic-Tests und danach die Convex-Funktionstests (`convex/*.test.ts`, `convex-test` mit Vitest) aus. Die Funktionstests prüfen Zugriffsschutz und Rollen, gesperrte Benutzer, Upload-Deduplizierung, permanente Stornierungen, Redo von mehreren Geräten, Benutzerzuordnung, Stapelgrenzen und den Admin-Export. Die Pure-Logic-Tests prüfen Berliner Datumsgrenzen/Zeitumstellung, Aggregate und Statistik, persistente Queue, verlorene Bestätigungen, Uploadfehler, Benutzerwechsel, abhängige Redos, Stapelgrenzen, Korrekturen, CSV und Update-Schutz. Auth, Rollen, mehrere Geräte, Offline-Rückkehr und Exporte zusätzlich gegen ein getrenntes Convex-Entwicklungsdeployment prüfen. Ein lokales anonymes Deployment ist mit `CONVEX_AGENT_MODE=anonymous npx convex dev --once` möglich, sofern die Systembibliotheken zum lokalen Convex-Backend passen.

Für Vercel:

1. In Convex ein Produktionsdeployment und dessen **Production Deploy Key** erstellen.
2. Produktionsvariablen in Convex setzen:

   ```bash
   npx convex env set --prod SITE_URL https://chaxterlog.vercel.app
   npx convex env set --prod BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
   ```

3. In Vercel `CONVEX_DEPLOY_KEY` als geheime Produktionsvariable hinterlegen. `NEXT_PUBLIC_CONVEX_SITE_URL` auf die Produktions-`.site`-Adresse und `NEXT_PUBLIC_SITE_URL` auf die Website-Origin setzen. `NEXT_PUBLIC_CONVEX_URL` wird vom folgenden Build-Befehl gesetzt; ein vorhandener Wert muss zum Produktionsdeployment passen.
4. Der Build-Befehl steht in `vercel.json` (`scripts/vercel-build.sh`) und führt in Produktion `npx convex deploy --cmd 'npm run build' --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL` aus. Website und Convex-Funktionen gehen so immer gemeinsam live. Fehlt der Key oder ist es kein Produktions-Key (`prod:…`), bricht der Build ab.

5. Nach dem ersten erfolgreichen Deployment den Produktions-Admin vorbereiten:

   ```bash
   SITE_URL=https://chaxterlog.vercel.app node --env-file=.env.local scripts/setup-admin.mjs --prod
   ```

   Den lokal gespeicherten Einmallink öffnen und das Passwort setzen. Der CLI-Zugang muss zum vorgesehenen Projekt gehören.

Produktionsadresse: https://chaxterlog.vercel.app. Bei Domainwechsel `SITE_URL` im richtigen Convex-Deployment und die öffentlichen Website-Variablen aktualisieren. Preview-Deployments brauchen ein eigenes Convex-Deployment mit passender Auth-Origin; keine produktive Zählung oder Benutzer für unkontrollierte Previews teilen.

### Vercel-Previews

`vercel.json` setzt den Build-Befehl auf `scripts/vercel-build.sh`. Produktion deployt mit dem Produktions-Key (siehe oben). Preview-Builds legen pro Branch ein eigenes Convex-Preview-Deployment an, deployen die Funktionen, und bauen die Website gegen dessen URL. Die `.site`-Adresse wird aus `NEXT_PUBLIC_CONVEX_URL` abgeleitet. Previews haben kein festes `SITE_URL`; Better Auth übernimmt die Origin pro Anfrage, wenn sie zu `SITE_ALLOWED_HOSTS` passt. Das Skript bricht ab, wenn `CONVEX_DEPLOY_KEY` kein Preview-Key (`preview:…`) ist, damit Previews nie in Dev oder Produktion deployen.

Einmalig:

1. Im Convex-Dashboard unter Project Settings einen **Preview Deploy Key** erzeugen und in Vercel als `CONVEX_DEPLOY_KEY` nur für **Preview** hinterlegen.
2. Standardvariablen für alle Previews (eigenes Secret, nicht das Produktions-Secret):

   ```bash
   openssl rand -base64 32 | npx convex env default set --type preview BETTER_AUTH_SECRET
   npx convex env default set --type preview SITE_ALLOWED_HOSTS 'chaxterlog-*-nbross.vercel.app'
   ```

Jede Preview startet mit leerer Datenbank. Admin für einen Branch vorbereiten (`SITE_URL` ist die Branch-URL aus Vercel, `--preview-name` der Git-Branch):

```bash
SITE_URL=https://chaxterlog-git-t3-mein-branch-nbross.vercel.app node scripts/setup-admin.mjs --preview-name t3/mein-branch
```

## Homescreen

Android/Chrome: Menü → „Installieren und Verknüpfung erstellen“. iOS/Safari: Teilen → „Zum Home-Bildschirm“. Manifest, PNG-Icons, maskierbares Icon und Apple-Touch-Icon sind enthalten. Split Screen und schwebende Browserfenster stellt das Betriebssystem bereit.

## Automatische App-Updates

Jeder Build enthält eine eindeutige öffentliche Versionskennung. `/api/version` bleibt unverändert und liefert die aktuelle Version mit `no-store` auch für CDN-Caches. Der globale Client prüft beim Laden, Fokus, Sichtbarkeit, Rückkehr aus dem Seitencache, Internet-Rückkehr und jede Minute. Bei neuer Version erfolgt nach mindestens zehn Sekunden ohne Bedienung ein vollständiges Neuladen; Version und Verbindung werden unmittelbar vorher erneut geprüft. Dieses Versions-Polling ist vom ereignisgesteuerten Besuchssync unabhängig.

Offene Klicks, Offline-Betrieb, aktive Eingabefelder und geänderte Formulare verhindern automatisches Neuladen. Die Queue bleibt im lokalen Speicher. Entwürfe werden pro Formular verfolgt. Wiederholte automatische Ladeversuche derselben Zielversion haben fünf Minuten Abstand. Unter Konto gibt es „Nach Updates suchen“.

Android kann geschlossene oder im Hintergrund liegende Apps pausieren; beim Zurückkehren wird geprüft. Es gibt keinen Service Worker oder Offline-Cache. Homescreen-Name und Symbol kann das Betriebssystem getrennt aktualisieren. Sehr alte, bereits geöffnete Versionen ohne Updateprüfung müssen einmal vollständig neu geladen werden; dabei keine Website-Daten mit offenen Klicks löschen.

## UI-Komponenten von interior.dev

`components/interior/` stammt aus der öffentlichen Registry von [interior.dev](https://www.interior.dev/docs/accordion); Quelladressen stehen am Anfang der Dateien. `motion` übernimmt Animationen. Accordion, Segmented Control, Loading Button, Copy Button, Floating Label und Modal werden in Konto, Statistik, Aktivitätsverlauf, Admin und Eventformularen verwendet. Die bestehenden Komponenten bleiben unverändert, einschließlich deutscher Texte, Theme-Anpassungen, Touch-Zielen, Formularvalidierung und Fokusverwaltung.
