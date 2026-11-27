/**
 * Zentrale Angaben für Impressum und Datenschutzerklärung.
 *
 * ⚠️ Vor dem Livegang ALLE {{…}}-Platzhalter ersetzen.
 *    Prüfen mit: npm run check:legal
 *
 * Die App wird von einer Privatperson ehrenamtlich für das
 * Jugendforum Grafing betrieben (kein Verein, kein Gewerbe, keine USt-ID).
 */
export const operator = {
  name: "{{IMPRESSUM_NAME}}",
  strasse: "{{IMPRESSUM_STRASSE}}",
  plzOrt: "{{IMPRESSUM_PLZ_ORT}}",
  email: "{{IMPRESSUM_EMAIL}}",
  /** Optional. Auf `null` setzen, um die Telefonnummer überall auszublenden. */
  telefon: "{{IMPRESSUM_TELEFON}}" as string | null,
};

export const LEGAL_STAND = "November 2026";
