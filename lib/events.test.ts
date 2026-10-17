import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDate, parseIcsContent, parseTextOrCsvContent, parseEventImport } from "./events.ts";

test("normalizeDate correctly formats German and ISO dates", () => {
  assert.equal(normalizeDate("2026-10-25"), "2026-10-25");
  assert.equal(normalizeDate("20261025"), "2026-10-25");
  assert.equal(normalizeDate("25.10.2026"), "2026-10-25");
  assert.equal(normalizeDate("5.4.2026"), "2026-04-05");
  assert.equal(normalizeDate("invalid"), null);
});

test("parseIcsContent extracts events from iCalendar exports", () => {
  const ics = `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Apple Inc.//macOS 14.5//EN
BEGIN:VEVENT
UID:test-1
DTSTART;VALUE=DATE:20261025
SUMMARY:Herbstfest im Jugendclub
DESCRIPTION:Kaffee\\, Kuchen und Musik
END:VEVENT
BEGIN:VEVENT
UID:test-2
DTSTART:20261101T140000Z
SUMMARY:Kicker-Turnier
END:VEVENT
END:VCALENDAR
  `.trim();

  const events = parseIcsContent(ics);
  assert.equal(events.length, 2);
  assert.deepEqual(events[0], {
    date: "2026-10-25",
    title: "Herbstfest im Jugendclub",
    description: "Kaffee, Kuchen und Musik",
  });
  assert.deepEqual(events[1], {
    date: "2026-11-01",
    title: "Kicker-Turnier",
    description: undefined,
  });
});

test("parseTextOrCsvContent extracts events from CSV and Excel tab-separated lines", () => {
  const csv = `
25.10.2026; Herbstfest; Großes Buffet
2026-10-31; Halloween-Party
01.11.2026\tKicker-Turnier\tMit Voranmeldung
14.11.2026 - Filmabend
  `.trim();

  const events = parseTextOrCsvContent(csv);
  assert.equal(events.length, 4);
  assert.equal(events[0].date, "2026-10-25");
  assert.equal(events[0].title, "Herbstfest");
  assert.equal(events[0].description, "Großes Buffet");
  assert.equal(events[1].date, "2026-10-31");
  assert.equal(events[1].title, "Halloween-Party");
  assert.equal(events[2].date, "2026-11-01");
  assert.equal(events[2].title, "Kicker-Turnier");
  assert.equal(events[3].date, "2026-11-14");
  assert.equal(events[3].title, "Filmabend");
});

test("parseEventImport auto-detects ICS vs text/csv", () => {
  const ics = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261224\nSUMMARY:Weihnachten\nEND:VEVENT\nEND:VCALENDAR";
  const icsEvents = parseEventImport(ics);
  assert.equal(icsEvents.length, 1);
  assert.equal(icsEvents[0].title, "Weihnachten");

  const text = "24.12.2026; Heiligabend";
  const textEvents = parseEventImport(text);
  assert.equal(textEvents.length, 1);
  assert.equal(textEvents[0].title, "Heiligabend");
});
