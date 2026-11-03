# Münzwaage für den Kasseneinsatz

Jeder der fünf gedruckten Münzstreifen liegt auf einer eigenen Wägezelle. Ein ESP32 liest alle
fünf Waagen und meldet der Kasse, wie viel Geld in welchem Fach liegt. Bei unsicheren
Einsortierungen (z. B. 1 € gegen 50 ct) soll die App zum Nachsehen auffordern.

![Gesamtansicht](vorschau_gesamt.png)
![Ein Modul](vorschau_modul.png)

## Aufbau eines Moduls

| Teil | Datei | Anzahl |
|---|---|---|
| Grundplatte | `stl/grundplatte.stl` | 4 |
| Grundplatte mit ESP32-Fach (Mitte) | `stl/grundplatte_mit_esp32.stl` | 1 |
| Träger (hier liegt der Münzstreifen drin) | `stl/traeger.stl` | 5 |
| Abstandshalter | `stl/abstandshalter.stl` | 5 |

- Die Wägezelle wird mit ihrem **festen Ende** von unten auf den Sockel der Grundplatte geschraubt.
- Auf das **freie Ende** kommt der Abstandshalter, darauf der Träger (Senkkopfschrauben von oben).
- Der Träger hängt nur an der Zelle und berührt sonst nichts: 2 mm Luft zum Nachbarn, 2 mm über
  dem festen Zellenende, 2 mm unter dem freien Ende.
- **Vier Anschlag-Schrauben** (M3×10, von unten in die Pfosten gedreht) fangen den Träger ab, wenn
  jemand fest draufdrückt. So kann die Zelle nicht überlastet werden.
- Das HX711 liegt in der Mulde neben der Zelle, die Kabel laufen im Kanal quer über alle Module.
- Die Module werden über die Schwalbenschwänze an den Längsseiten zusammengesteckt.

Gesamtmaß mit den Standardwerten: **144 × 255 mm, Höhe bis Oberkante Trägerboden 18 mm**
(der Münzstreifen kommt obendrauf).

## Maße anpassen

Die Standardwerte sind aus dem Foto geschätzt. Vor dem Drucken bitte nachmessen und oben in
`generate.py` eintragen:

- `STRIP_LEN`, `STRIP_W` – Länge und Breite eines Münzstreifens
- `CLAMP_LEN`, `SCREW_SLOT` – Länge des massiven Endblocks der Wägezelle und Lage der Gewindelöcher.
  Der Sockel darf **nur unter dem Endblock** liegen, nicht unter dem dünnen Mittelteil.

Neu erzeugen:

```sh
python3 -m venv .venv && .venv/bin/pip install manifold3d numpy matplotlib
.venv/bin/python generate.py
```

## Druck

PETG (kriecht weniger als PLA unter Dauerlast), 0,2 mm Schicht, 3 Wände, 30 % Füllung, ohne Stützen.
Alle Teile liegen flach so, wie sie exportiert sind.

## Einkaufsliste

| Teil | Menge | Hinweis |
|---|---|---|
| Mini-Wägezelle 47×12×6 mm, **500 g** | 5 (4 + 1 Ersatz) | für 2 €, 1 €, 50 ct, 20 ct |
| Mini-Wägezelle 47×12×6 mm, **300 g** | 2 (1 + 1 Ersatz) | für 10 ct + 5 ct |
| HX711-Modul | 1 Pack à 10 | |
| ESP32-C3 SuperMini | 2 (1 Ersatz) | |
| Schraube M3×10, Zylinderkopf (DIN 912) | 1 Pack à 50 | 6 pro Modul |
| Schraube M3×10, Senkkopf (DIN 7991) | 1 Pack à 20 | 2 pro Modul |
| Silikonlitze 26 AWG (mehrere Farben) | 1 Set | Verbindung HX711 → ESP32 |
| Doppelseitige Klebepads | 1 Pack | HX711 und ESP32 fixieren |

Ein voller Streifen fasst 50 Münzen: 2 € wiegen dann 425 g, dazu Träger und Streifen. Deshalb
500 g für die schweren Streifen; die 300-g-Zelle reicht nur für 10 ct + 5 ct.

## Verdrahtung

Wägezelle → HX711: Rot = E+, Schwarz = E−, Grün (oder Blau) = A+, Weiß = A−.

| Streifen | HX711 DT | HX711 SCK |
|---|---|---|
| 1 (10 ct + 5 ct) | GPIO 0 | GPIO 1 |
| 2 (20 ct) | GPIO 3 | GPIO 4 |
| 3 (50 ct) | GPIO 5 | GPIO 6 |
| 4 (1 €) | GPIO 7 | GPIO 10 |
| 5 (2 €) | GPIO 20 | GPIO 21 |

Alle HX711: VCC an 3V3, GND an GND. GPIO 2, 8 und 9 bleiben frei (Startpins des ESP32-C3).

## Anschläge einstellen

1. Alles montieren, Firmware zeigt die Live-Werte.
2. Anschlag-Schraube von unten hochdrehen, bis sich der Messwert bewegt (sie berührt den Träger).
3. Eine ganze Umdrehung zurück: das sind 0,5 mm Luft.
