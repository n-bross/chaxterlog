export type ChaxterEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  description?: string;
  createdAt: string;
  createdBy?: string;
};

export type ChaxterEventInput = {
  id?: string;
  date: string; // YYYY-MM-DD
  title: string;
  description?: string;
};

export function normalizeDate(input: string): string | null {
  const trimmed = input.trim();
  // Format YYYY-MM-DD or YYYYMMDD
  const isoMatch = trimmed.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }

  // Format DD.MM.YYYY or DD/MM/YYYY
  const deMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (deMatch) {
    const [, d, m, y] = deMatch;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Parses iCalendar (.ics) string content and extracts all VEVENT items.
 */
export function parseIcsContent(content: string): ChaxterEventInput[] {
  const events: ChaxterEventInput[] = [];
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  // Unfold folded lines (lines starting with space or tab)
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  let inEvent = false;
  let currentStart = "";
  let currentSummary = "";
  let currentDesc = "";

  for (const rawLine of unfolded) {
    const line = rawLine.trim();
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      currentStart = "";
      currentSummary = "";
      currentDesc = "";
      continue;
    }
    if (line === "END:VEVENT") {
      if (inEvent && currentStart && currentSummary) {
        const date = normalizeDate(currentStart);
        if (date) {
          events.push({
            date,
            title: unescapeIcs(currentSummary),
            description: currentDesc ? unescapeIcs(currentDesc) : undefined,
          });
        }
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    if (line.startsWith("DTSTART")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        currentStart = line.slice(colonIdx + 1).trim();
      }
    } else if (line.startsWith("SUMMARY")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        currentSummary = line.slice(colonIdx + 1).trim();
      }
    } else if (line.startsWith("DESCRIPTION")) {
      const colonIdx = line.indexOf(":");
      if (colonIdx !== -1) {
        currentDesc = line.slice(colonIdx + 1).trim();
      }
    }
  }

  return events;
}

function unescapeIcs(str: string): string {
  return str
    .replace(/\\n/g, " ")
    .replace(/\\N/g, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/**
 * Parses CSV / TSV (Excel paste) or text lines:
 * Formats supported:
 * 2026-10-25; Titel; Beschreibung
 * 25.10.2026, Titel
 * 25.10.2026\tTitel\tBeschreibung
 * 25.10.2026 - Titel
 */
export function parseTextOrCsvContent(content: string): ChaxterEventInput[] {
  const events: ChaxterEventInput[] = [];
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Try semicolon, tab, or comma delimiter
    let parts: string[] = [];
    if (line.includes("\t")) {
      parts = line.split("\t").map((p) => p.trim());
    } else if (line.includes(";")) {
      parts = line.split(";").map((p) => p.trim());
    } else if (line.includes(",")) {
      parts = line.split(",").map((p) => p.trim());
    } else if (line.includes(" - ")) {
      parts = line.split(" - ").map((p) => p.trim());
    }

    if (parts.length >= 2) {
      const datePart = parts[0].replace(/^["']|["']$/g, "").trim();
      const titlePart = parts[1].replace(/^["']|["']$/g, "").trim();
      const descPart = parts[2]?.replace(/^["']|["']$/g, "").trim();

      const date = normalizeDate(datePart);
      if (date && titlePart) {
        events.push({
          date,
          title: titlePart,
          description: descPart || undefined,
        });
        continue;
      }
    }

    // Fallback: check if line starts with a date followed by text
    const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})[:\s-]+(.+)$/);
    if (dateMatch) {
      const date = normalizeDate(dateMatch[1]);
      const title = dateMatch[2].trim();
      if (date && title) {
        events.push({ date, title });
      }
    }
  }

  return events;
}

/**
 * Universal auto-detection parser for imported file or pasted text content.
 */
export function parseEventImport(content: string): ChaxterEventInput[] {
  if (content.includes("BEGIN:VCALENDAR") || content.includes("BEGIN:VEVENT")) {
    return parseIcsContent(content);
  }
  return parseTextOrCsvContent(content);
}
