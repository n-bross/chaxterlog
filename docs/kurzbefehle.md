# Zählen per Handy: Kurzbefehle und Widgets

Mit einem persönlichen Token kann ChaxterLog ohne geöffnete App zählen: über Apple Kurzbefehle, ein Scriptable-Widget oder die Android-App **HTTP Shortcuts**. Alle Klicks laufen durch dieselbe Logik wie in der App. Statistik, Stundenverteilung, Korrekturprotokoll und Live-Zähler bleiben also stimmig.

## 1. Token erstellen

1. In ChaxterLog **Konto → Handy-Widget & Kurzbefehle** öffnen.
2. Einen Gerätenamen eingeben (z. B. „Nicos iPhone“) und **Token erstellen** tippen.
3. Den Token (`chx_…`) sofort kopieren. Er wird nur einmal angezeigt.

Jeder Token zählt unter deinem Benutzernamen und erscheint in der Geräteliste als eigenes Gerät. Ein Token lässt sich dort jederzeit löschen. Wenn der Admin ein Konto sperrt, löscht oder dessen Passwort zurücksetzt, werden auch alle Tokens dieses Kontos ungültig.

## 2. Schnittstelle

Adresse: `https://chaxterlog.jufo-grafing.de/api/v1`
Anmeldung: Header `Authorization: Bearer chx_…`

| Aktion | Anfrage | Inhalt |
|---|---|---|
| Besuch zählen | `POST /visit` | `{"group":"u15"}` oder `{"group":"o15"}`; optional `"id"` (UUID), damit eine Wiederholung nur einmal zählt |
| Rückgängig | `POST /undo` | leer = dein letzter Klick heute; `{"group":"u15"}` = dein letzter U15-Klick heute |
| Tageszahlen | `GET /today` | — |

Jede Antwort enthält die aktuellen Tageszahlen und ein fertiges Feld `text`, auch bei Fehlern:

```json
{ "date": "2026-10-22", "u15": 12, "o15": 30, "total": 42, "group": "u15", "text": "U15 +1 → U15: 12 · Ü15: 30 · Gesamt: 42" }
```

Mit `?format=text` an der Adresse kommt nur dieser Satz als reiner Text zurück. Das ist praktisch für Mitteilungen und Toasts.

„Rückgängig“ betrifft nur **deine eigenen** Klicks von heute, egal ob sie aus der App oder per Kurzbefehl kamen. Klicks anderer Mitarbeiter werden nie zurückgenommen.

Nur für Widget-Apps, die keine Header setzen können: `GET /today` akzeptiert den Token auch als `?token=chx_…`. Zählen und Rückgängig gehen ausschließlich mit Header. Wer diese Adresse sieht, kennt trotzdem den vollständigen Token. Gib sie also nicht weiter.

Zum Testen am Rechner:

```sh
curl -X POST https://chaxterlog.jufo-grafing.de/api/v1/visit \
  -H "Authorization: Bearer chx_…" -H "Content-Type: application/json" -d '{"group":"u15"}'
```

## 3. iPhone: Apple Kurzbefehle (Knöpfe)

Einen Kurzbefehl pro Knopf anlegen, z. B. **U15 +1**:

1. Kurzbefehle-App → **+** → Aktion **„Inhalte von URL abrufen“**.
2. URL: `https://chaxterlog.jufo-grafing.de/api/v1/visit?format=text`
3. Auf den Pfeil tippen: **Methode** `POST`.
   **Header** hinzufügen: Schlüssel `Authorization`, Wert `Bearer chx_…`.
   **Haupttext anfordern**: `JSON`, Feld `group` (Text) = `u15`.
4. Aktion **„Mitteilung anzeigen“** mit dem Ergebnis „Inhalte der URL“.
5. Kurzbefehl „U15 +1“ nennen und ein Symbol wählen.

Danach den Kurzbefehl duplizieren:

- **Ü15 +1**: `group` = `o15`.
- **Rückgängig**: URL `…/api/v1/undo?format=text` und das JSON-Feld löschen. Optional `group` setzen, wenn es zwei getrennte Rückgängig-Knöpfe geben soll.
- **Stand**: URL `…/api/v1/today?format=text`, Methode `GET`.

Wo die Knöpfe liegen können:

- **Home-Bildschirm**: Widget „Kurzbefehle“ (mittel = 4 Knöpfe) mit einem Ordner, der genau diese Kurzbefehle enthält. Kurzbefehle laufen dort im Hintergrund, die App öffnet sich nicht.
- **Kontrollzentrum oder Sperrbildschirm** (ab iOS 18): Steuerelement „Kurzbefehl“ hinzufügen.
- **Action-Taste** (iPhone 15 Pro und neuer): Einstellungen → Action-Taste → Kurzbefehl.
- **Rückseite tippen**, gut geeignet für Rückgängig: Einstellungen → Bedienungshilfen → Tippen → Auf Rückseite tippen → Doppeltippen → Kurzbefehl „Rückgängig“.
- **Siri**: startet jeden Kurzbefehl über seinen Namen, z. B. „Hey Siri, U15 plus eins“, wenn der Kurzbefehl so heißt.

## 4. iPhone: Zähl-Widget mit Scriptable

Ein mittelgroßes Widget mit drei Knöpfen: **U15** und **Ü15** zeigen jeweils den Tagesstand und zählen beim Tippen +1, **↶** nimmt deinen letzten eigenen Klick von heute zurück. Unten stehen Gesamtzahl und Uhrzeit der letzten Änderung im Team, oben die Uhrzeit, zu der das Widget zuletzt geladen hat.

1. [Scriptable](https://apps.apple.com/app/scriptable/id1405459188) installieren (kostenlos).
2. In ChaxterLog nach dem Erstellen des Tokens **Scriptable-Widget kopieren** tippen. Das Skript enthält Adresse und Token bereits.
3. Scriptable → **+** → einfügen → oben „ChaxterLog“ als Namen eintragen.
4. Auf dem Home-Bildschirm ein **mittleres** Scriptable-Widget hinzufügen → gedrückt halten → **Widget bearbeiten** → Script: „ChaxterLog“, „Bei Interaktion“: **App öffnen** (Standard). Die Knöpfe bringen ihre eigenen Links mit; in der kleinen Größe funktionieren sie nicht.

Grenzen, die iOS vorgibt:

- **Ein Tipp öffnet kurz die Scriptable-App.** Scriptable-Widgets können nur Links öffnen. Der Knopf startet das Skript in der App, es zählt und zeigt den neuen Stand als Mitteilung. Danach zurück zum Home-Bildschirm wischen. Knöpfe, die direkt im Widget arbeiten, gibt es nur mit einer eigenen iOS-App.
- **Wie oft das Widget neu lädt, bestimmt iOS.** `refreshAfterDate` ist nur ein Wunsch. Änderungen von anderen erscheinen erst beim nächsten Neuladen.

**Refresh-Geschwindigkeit messen:** Das Skript protokolliert jedes Neuladen des Widgets und jeden Tipp. Das Skript direkt in Scriptable starten → **Refresh-Protokoll** zeigt Uhrzeit, Abstand zum vorherigen Eintrag, Stand und Quelle. Für den Test zählt jemand anderes in der App. Die Differenz zwischen „geändert“ im Widget und dem Zeitpunkt, zu dem der neue Stand erscheint, ist die Verzögerung.

**Widgy** funktioniert ebenfalls: als Datenquelle JSON von `…/api/v1/today?token=chx_…` mit den Feldern `u15`, `o15` und `total`. Die Knöpfe laufen weiter über Kurzbefehle.

## 5. Android: HTTP Shortcuts (Knöpfe)

[HTTP Shortcuts](https://http-shortcuts.rmy.ch/) ist kostenlos und Open Source (Play Store und F-Droid) und das Gegenstück zu Apple Kurzbefehlen. Menübezeichnungen können je nach App-Version leicht abweichen.

1. Einmalig unter **Variablen** eine Konstante `token` mit dem Wert `chx_…` anlegen.
2. **+** → **Normaler Shortcut**, Name „U15 +1“.
3. **Grundeinstellungen**: Methode `POST`, URL `https://chaxterlog.jufo-grafing.de/api/v1/visit?format=text`.
4. **Header**: `Authorization` = `Bearer ` und dahinter die Variable `token` über den Variablen-Knopf einfügen.
5. **Anfrage-Body**: eigener Text, Content-Type `application/json`, Inhalt `{"group":"u15"}`.
6. **Antwort-Behandlung**: Antwort als Toast anzeigen. Bei Erfolg erscheint z. B. „U15 +1 → U15: 12 · Ü15: 30 · Gesamt: 42“.

Für „Ü15 +1“, „Rückgängig“ (URL `/undo?format=text`, Body leer) und „Stand“ (`GET /today?format=text`) den Shortcut duplizieren und anpassen. Auf den Startbildschirm kommen die Knöpfe über das Menü des Shortcuts (**Auf Startbildschirm platzieren**) oder als Widget (Startbildschirm gedrückt halten → Widgets → HTTP Shortcuts).

**Zahlen auf dem Startbildschirm (optional):** In KWGT kann ein Textfeld `$wg("https://chaxterlog.jufo-grafing.de/api/v1/today?format=text&token=chx_…", txt)$` den Stand anzeigen.

## 6. Warum es keinen „Gedrückt halten = Rückgängig“-Knopf gibt

Weder iOS noch Android geben langes Drücken auf Home-Bildschirm-Widgets an die Widget-App weiter. Das System nutzt die Geste selbst, um Widgets zu bearbeiten oder zu verschieben. Das gilt für Kurzbefehle, Scriptable, Widgy, HTTP Shortcuts und auch für native Apps. Rückgängig ist deshalb ein eigener, kleiner Knopf (oder Rückseite tippen auf dem iPhone). Die Logik dafür liegt auf dem Server, nicht im Widget: Nur der Server weiß zuverlässig, welcher Klick zuletzt von dir kam.
