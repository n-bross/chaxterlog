<p align="center">
  <img src="assets/logo.png" alt="ChaxterLog Logo" width="160" />
</p>

# ChaxterLog

Besucherzählung für das Schülercafé Grafing (Chaxter): Next.js App Router, TypeScript und Tailwind CSS, PostgreSQL bei Neon und Benutzeranmeldung mit Better Auth.

## Starten

```bash
npm ci
vercel env pull .env.local
# In .env.local für lokale Entwicklung setzen:
# BETTER_AUTH_URL=http://localhost:3000
npm run dev
```

Jeder zusätzliche Git-Worktree benötigt eine eigene `.env.local`; Git übernimmt diese ignorierte Datei nicht. Die vorhandene Entwicklungskonfiguration in das neue Arbeitsverzeichnis übernehmen und `BETTER_AUTH_URL` auf dessen lokale Adresse und Port setzen, bevor die Anmeldung geprüft wird.

Benötigte Variablen: `DATABASE_URL`, `BETTER_AUTH_SECRET` (zufälliger, mindestens 32 Zeichen langer Server-Schlüssel), `BETTER_AUTH_URL` (die tatsächliche Website-Origin). `.env.local` und `.vercel` werden nicht eingecheckt. `.env.example` enthält nur Platzhalter. Die URL muss zum verwendeten Host und Port passen; in dieser Arbeitsumgebung ist der Entwicklungsserver auf Port 3002.

## Datenbank und erster Admin

Die kostenlose Neon-Datenbank `chaxterlog-db` in Frankfurt ist mit dem Vercel-Projekt verbunden. Vor dem ersten Deployment die versionierten, additiven Schema-Skripte ausführen:

```bash
node --env-file=.env.local --experimental-strip-types scripts/setup-auth.mts
node --env-file=.env.local scripts/setup-database.mjs
```

Das Auth-Skript verwendet den Schema-Migrator der installierten Better-Auth-Version. Bestehende Tabellen werden nicht gelöscht. Für Migrationstests und Entwicklung mit produktiven Daten getrennte Neon-Branches verwenden.

Das zweite Skript erzeugt beim erstmaligen Anlegen der Einrichtung einen zufälligen Einmallink und speichert ihn ausschließlich in `.vercel/admin-setup-link.txt`. Der Link gilt sieben Tage und erlaubt das einmalige Setzen des Passworts für `admin`. In der Datenbank liegt nur sein SHA-256-Hash. Das Token befindet sich im URL-Fragment und wird erst beim Abschicken des Formulars im POST-Body übertragen. Link vertraulich behandeln. Nach erfolgreicher Einrichtung funktioniert er nicht mehr; die Route legt niemals einen zweiten Admin an. Die Admin-Erstellung ist gegen parallele Einlösungen durch eine Datenbanksperre geschützt. Ein Absturz nach der Benutzeranlage kann die erneute Einrichtung blockieren; dann ist Serverzugriff zur Wiederherstellung erforderlich.

## Anmeldung und Rollen

- Anmeldung mit **Benutzername und Passwort**, ohne E-Mail-Eingabe, E-Mail-Versand oder öffentliche Registrierung.
- Die Auth-Bibliothek verwendet intern eine zufällige Adresse unter der reservierten Domain `chaxter.invalid`, weil ihr Basisschema dieses Feld benötigt. Sie enthält keine echte E-Mail-Adresse und wird in der Oberfläche nicht gezeigt. Nur Benutzername-Anmeldung ist öffentlich freigegeben.
- Passwörter werden von Better Auth gehasht. Sitzungen liegen serverseitig in PostgreSQL, mit HttpOnly-Cookies und Secure-Cookies über HTTPS; maximale Lebensdauer 30 Tage. Login-Limit: fünf Versuche pro Minute und IP, in der Datenbank über mehrere Serverinstanzen hinweg.
- `/`, `/statistik` und `/konto` benötigen eine gültige Sitzung. `/api/track` und `/api/device` sind ebenfalls geschützt.
- `/admin`, Benutzerverwaltung und Export benötigen die serverseitig geprüfte Admin-Rolle. Ein ausgeblendeter Link ist nicht der Zugriffsschutz. Mitarbeiter werden bei direktem Seitenaufruf zur Zählung geleitet; direkte Admin-API-Aufrufe erhalten 403.
- Der Admin-Link steht ausschließlich bei Admins unter dem Konto-Symbol oben links. Mitarbeiterzugänge lassen sich dort erstellen, sperren, freigeben und mit einem neuen Passwort versehen. Sperren und Passwort-Zurücksetzen beenden bestehende Sitzungen.
- Benutzer ändern ihr eigenes Passwort unter Konto. Dabei werden andere Anmeldungen dieses Kontos beendet. Ohne E-Mail gibt es keinen E-Mail-Passwortreset; das erste Admin-Passwort sicher aufbewahren. Admin-Wiederherstellung benötigt Serverzugriff.
- Beim Abmelden müssen offene Klicks zuerst synchronisiert werden. Nicht hochgeladene Klicks eines anderen Benutzers werden nach einem Kontowechsel nicht stillschweigend neu zugeordnet.

## Zählen, Datum und Statistik

Zwei große Buttons zählen U15/Ü15. Die Tagesgesamtzahl steht oben mittig, Statistik links und die Datumsauswahl rechts. Neue Klicks speichern immer den tatsächlichen Zeitpunkt und wechseln zur heutigen Ansicht zurück. Undo und Redo stehen als große Buttons nebeneinander. Undo storniert den neuesten noch gezählten Besuch des heutigen Tages im lokal bekannten gemeinsamen Stand. Offline-Ansichten kennen noch nicht die neuesten Änderungen anderer Geräte.

Die Liste einzelner Besuche zeigt unter Datum/Uhrzeit/Gruppe außerdem Benutzer, Gerätename, Plattform und eine kurze Browserkennung. Bei importierten Altbeständen bleibt der ursprüngliche Benutzer unbekannt; das übertragende Gerät wird als Importgerät bezeichnet.

Die Statistik bietet Tag, Woche (Montag–Sonntag), Monat, Jahr und Gesamt sowie Verlauf, Stundenverteilung, Wochentagsdurchschnitte und eine Besuchsliste. Beste Wochentage beruhen auf Durchschnitten je erfasstem Tag; Stunden und einzelne Tage auf Besuchssummen. Nicht erfasste Öffnungstage sind unbekannt. Gleichstände bleiben sichtbar. Unter sieben erfassten Tagen wird auf eine erste Tendenz hingewiesen. Zeitzone und Tagesgrenzen: **Europe/Berlin**.

Die Gruppengrenze genau 15-jähriger Besucher muss fachlich festgelegt werden. Gezählt werden Besuche, keine eindeutig identifizierten Besucher.

## Gemeinsamer Sync und Offline-Warteschlange

- Sichtbare Ansichten gleichen sich alle drei Sekunden, bei Fokus und bei Wiederkehr der Verbindung ab. Gleiche API und Datenbank bedeuten gleiche Zählung in unterschiedlichen Browsern und Geräten. Ein kleiner grüner Punkt zeigt erfolgreichen Abgleich, „Offline“ einen fehlgeschlagenen Abgleich.
- Jeder Klick wird vor der sichtbaren Erhöhung synchron in localStorage gespeichert, mit UUID und ISO-Zeitstempel. Eine persistente Warteschlange sendet fehlgeschlagene Übertragungen erneut.
- PostgreSQL dedupliziert über die UUID. Undo bleibt als permanente Stornierung gespeichert. Redo erstellt einen verknüpften Ersatzdatensatz mit deterministischer UUID v5 und dem ursprünglichen Besuchszeitpunkt. So können alte Uploads Stornierungen nicht aufheben und gleichzeitige Redo-Klicks auf mehreren Geräten zählen denselben wiederhergestellten Besuch nur einmal. Andere Geräte übernehmen beide Korrekturen.
- Vorhandene lokale Klicks werden nach dem Update und Login automatisch hochgeladen. Jede bisher verwendete Browseransicht muss einmal geöffnet werden. Ihr ursprünglicher Benutzer ist unbekannt; sie werden als Altbestand markiert, und der importierende Benutzer wird separat protokolliert. Bestehende, unabhängig doppelt erfasste Besuche mit verschiedenen IDs können nicht automatisch dedupliziert werden.
- Neue Klicks speichern die angemeldete Benutzer-ID und den Benutzernamen. Der Server übernimmt den Benutzer aus der Sitzung, nicht aus frei übermittelten Feldern. Stornierende Benutzer und Serverzeitpunkt werden separat festgehalten.
- Browserdaten nicht löschen, solange Klicks offen sind. Ein Wechsel der Website-Adresse oder des Browsers hat zunächst einen getrennten lokalen Speicher: zuerst die alte Ansicht online synchronisieren.
- Die App benötigt beim Laden/Neuladen eine Verbindung. Eine bereits geladene Seite kann bei Verbindungsverlust weiter lokal zählen. Es gibt keinen Service Worker und keine garantierte Offline-Neuladung.
- Die aktuelle Prototyp-Version lädt bei jedem Abgleich den gesamten Ereignisbestand. Bei größeren Beständen auf inkrementellen Abgleich umstellen.

## Geräte

Eine zufällige UUID in localStorage identifiziert eine **Browserinstallation**, keine physische Hardware. Verschiedene Browser auf demselben Tablet erhalten verschiedene Kennungen. Unter Konto lässt sich z. B. „Kasse Tablet“ als Name vergeben. Neue Klicks enthalten diesen Namen und grobe Angaben zu Betriebssystem/Browser; historische Namen bleiben beim ursprünglichen Klick erhalten. Der Admin sieht Kennung, aktuellen Namen, letzten Upload und letzten hochladenden Benutzer. Betriebssystem/Browser sind bestmögliche Erkennung und können ungenau sein. Keine Hardware-Seriennummern, IMEI oder GPS-Ortung.

## Admin-Export

Unter `/admin` kann der Admin einen Datumsbereich wählen (inklusive, Berlin-Zeit) oder den gesamten Bestand laden:

- **Einzelbesuche CSV:** Datum, Uhrzeit, UTC-Zeitpunkt, Gruppe, Status, Benutzer, Gerät, Plattform, Altbestand, Import und Undo-Informationen. Einschließlich Stornierungen.
- **Tageswerte CSV:** U15, Ü15 und Gesamt je erfasstem Tag; nur aktive Besuche.
- **JSON:** Ereignisbestand einschließlich Stornierungen und Metadaten, ohne Passwörter oder Sitzungen.

CSV verwendet UTF-8 mit BOM, Semikolon, korrektes Quoting und Schutz vor Tabellenformeln in Textfeldern. Alle Downloads sind serverseitig Admin-geschützt und nicht cachebar.

## API

- `GET /api/track`: vollständige Ereignisliste einschließlich Stornierungen.
- `POST /api/track`: einzelner Besuch oder `{ records: [...] }` mit maximal 200 Einträgen. Erfolg: 200 und `persisted: true`.
- `DELETE /api/track`: einzelner Besuch als Stornierung.
- Ungültige Eingaben: 400; fehlende Anmeldung: 401; fremder Browser-Origin: 403; falscher Benutzer bei offenen Klicks: 409; Datenbankfehler: 503.
- `POST /api/device`: Namen dieser Browserinstallation speichern.
- `GET/POST /api/admin/users`: Übersicht und Verwaltung.
- `GET /api/admin/export?format=csv|daily|json|corrections&from=YYYY-MM-DD&to=YYYY-MM-DD`: geschützter Download.

## Prüfung und Deployment

```bash
npm test
npm run typecheck
npm run build
```

Die Tests prüfen Berliner Datumsgrenzen und Zeitumstellung, Statistik, getrennte Speicher, alte lokale Daten, Wiederholungen, verlorene Empfangsbestätigungen, Offline-Nachsenden, Undo-Rennen und CSV-Escaping. Zugriffsschutz und Datenbankabgleich zusätzlich mit getrennten Benutzer-Sitzungen prüfen.

Das Projekt ist mit GitHub und Vercel verbunden; Änderungen können nach Commit und Push automatisch bereitgestellt werden. Direkte Veröffentlichung im bestehenden Projekt:

```bash
vercel deploy --prod --yes --scope nbross
```

Produktionsadresse: https://chaxterlog.vercel.app. Bei einer Domainänderung auch `BETTER_AUTH_URL` aktualisieren und neu deployen. Entwicklung und Preview sollten separate Datenbanken nutzen; mit derselben `DATABASE_URL` teilen sie sich auch Benutzer und Besucherzählung.

## Homescreen

Android/Chrome: Menü → „Installieren und Verknüpfung erstellen“. iOS/Safari: Teilen → „Zum Home-Bildschirm“. Manifest, PNG-Icons, maskierbares Icon und Apple-Touch-Icon sind enthalten. Split Screen oder schwebende Browserfenster werden vom Betriebssystem bereitgestellt, nicht von der Website.

## Automatische App-Updates

Jeder Build enthält eine eindeutige öffentliche Versionskennung. `/api/version` liefert die aktuell bereitgestellte Version mit `no-store` auch für CDN-Caches. Ein globaler Client prüft beim Laden, bei Fokus, Sichtbarkeit, Wiederherstellung aus dem Seitencache, Internet-Rückkehr und jede Minute. Bei einer neuen Version erfolgt nach mindestens zehn Sekunden ohne Bedienung ein vollständiges Neuladen. Direkt davor werden Version und Verbindung erneut geprüft.

Offene Klicks, Offline-Betrieb, aktive Eingabefelder und geänderte Formulare verhindern das automatische Neuladen. Die Warteschlange bleibt unverändert im lokalen Speicher. Formulare werden pro Formular verfolgt; das Zurücksetzen eines anderen Formulars gibt einen offenen Entwurf nicht frei. Wiederholte automatische Ladeversuche derselben Zielversion haben fünf Minuten Abstand, um Schleifen bei verzögert ausgelieferten Versionen zu verhindern. Unter Konto gibt es zusätzlich „Nach Updates suchen“.

Die Prüfung läuft, solange die App geöffnet und sichtbar ist. Android kann geschlossene oder im Hintergrund liegende Apps pausieren; beim Zurückkehren wird erneut geprüft. Es wird kein Service Worker und kein Offline-Cache hinzugefügt. App-Inhalt und Website-Version werden aktualisiert; Homescreen-Name und -Symbol kann das Betriebssystem separat aktualisieren.

**Einmaliger Übergang:** Eine bereits geöffnete alte Version enthält diese Prüfung noch nicht. Sie muss einmal vollständig neu geladen werden, zum Beispiel über „Im Browser öffnen“ → Neu laden und anschließend die installierte App vollständig schließen und wieder öffnen. Keine Website-Daten löschen, da darin offene Klicks liegen können.


## Undo, Redo und Korrekturprotokoll

### Direktes Abziehen per Long-Press (Lange gedrückt halten)

Auf den großen Zählbuttons **U15** und **Ü15** kann ein Besuch direkt von der jeweiligen Gruppe abgezogen werden:
- **Tippen / Klick:** Zählt +1 für die gewählte Gruppe.
- **Lange gedrückt halten (500 ms):** Zieht gezielt einen Besuch der jeweiligen Altersgruppe ab (storniert den neuesten aktiven Besuch dieser Gruppe des heutigen Tages).
- **Visuelles & haptisches Feedback:** Ein animierter Ladebalken am unteren Rand zeigt das Halten an; beim Erreichen der 500 ms erscheint ein rotes `−1`-Badge mit haptischem Feedback (Vibration) und Schüttelanimation.
- **Tastatur:** Für Desktop-Bedienung zieht `Shift` + Klick oder `Alt` + Klick auf den Button ebenfalls direkt 1 ab.
- **Redo & Audit:** Ein so abgezogener Besuch erzeugt einen regulären Undo-Eintrag im Audit-Protokoll und kann bei Bedarf über **Redo** jederzeit wiederhergestellt werden.

Undo nimmt den neuesten aktiven Besuch des heutigen Tages zurück. Redo stellt den zuletzt zurückgenommenen, noch nicht wiederhergestellten Besuch dieses Tages wieder her. Neue Zählklicks löschen diese Möglichkeit nicht. Beide Knöpfe sind beim Ansehen früherer Tage deaktiviert. Die ursprüngliche Besuchszeit bleibt bei Redo erhalten; der wiederherstellende Benutzer und sein Gerät stehen am Ersatzdatensatz. Undo-/Redo-Ketten bleiben beliebig fortsetzbar und nach Neuladen verfügbar.

Jeder tatsächlich verwendete Korrekturknopf erzeugt eine eigene Aktions-ID mit Typ, lokalem Betätigungszeitpunkt, Benutzer, Gerät und Server-Empfangszeit. Die Benutzerzuordnung neuer Aktionen kommt aus der authentifizierten Sitzung. Bereits gespeicherte Aktionen sind unveränderlich; Retries mit derselben ID erzeugen keinen zusätzlichen Protokolleintrag. Gleichzeitige Redo-Betätigungen können mehrere Bedienaktionen protokollieren, stellen aber nur einen Besuch wieder her.

Die Warteschlange speichert die Korrektur zusammen mit dem betroffenen Besuch in einem lokalen Schreibvorgang. Alte Serverantworten dürfen unbestätigte lokale Aktionen nicht entfernen. Beim Nachsenden werden abhängige Redo-Einträge nach ihren Ursprüngen gesendet. Stapel werden nach Anzahl und JSON-Größe begrenzt. Wie bei allen localStorage-Daten darf der Browserspeicher vor dem erfolgreichen Abgleich nicht gelöscht werden.

Die Statistik zeigt unter **Undo & Redo** ein eigenes Protokoll, nach dem Zeitpunkt der Korrektur und dem gewählten Tages-/Wochen-/Monats-/Jahres-/Gesamtzeitraum gefiltert. Besucherzahlen und Diagramme berücksichtigen weiterhin nur aktive Besuche. Das Protokoll bleibt bei erneutem Undo oder Redo erhalten. Die Liste ist mit 50 Aktionen pro Seite paginiert.

Der Admin kann **Undo & Redo · CSV** herunterladen; JSON enthält zusätzlich `corrections`. Diese Protokollexporte verwenden den Aktionszeitraum, während Besuchsexporte den Besuchszeitraum verwenden. Frühere Undo-Aktionen werden mit vorhandener Serverzeit und vorhandenem Benutzer übernommen; deren Bediengerät wurde früher nicht gespeichert und bleibt unbekannt. Für das Schema additiv ausführen:

```bash
node --env-file=.env.local scripts/setup-corrections.mjs
```

Die Migration erstellt die Korrekturtabelle und eine eindeutige Redo-Verknüpfung, löscht keine Besuche und wird bei frischer Einrichtung auch vom Datenbank-Setup ausgeführt. UUID v4 (Zählung/Aktion) und v5 (deterministisches Redo) werden unterstützt. Für Entwicklung und Migrationstests eine separate Datenbank oder einen Neon-Branch verwenden.


## UI-Komponenten von interior.dev

Die Komponenten unter `components/interior/` stammen aus der öffentlichen Registry von [interior.dev](https://www.interior.dev/docs/accordion). Die jeweilige Quelladresse steht am Anfang jeder Datei. `motion` übernimmt die Animationen.

Accordion, Segmented Control, Loading Button, Copy Button, Floating Label und Modal werden in Konto, Statistik, Aktivitätsverlauf, Admin und Eventformularen verwendet. Die lokalen Anpassungen ergänzen deutsche Texte, vorhandene Theme-Farben, größere Touch-Ziele und Formularattribute. Loading Button unterstützt zusätzlich einen gesteuerten Formularmodus: native Validierung, Absenden per Enter und die bestehenden Submit-Handler bleiben erhalten. Modals bringen Fokusverwaltung, Escape und die Rückkehr zum auslösenden Element mit.
