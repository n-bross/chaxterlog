import { dayKey, type TrackEvent } from "./tracking.ts";
import type { ChaxterEvent } from "./events.ts";

export type EventWithStats = ChaxterEvent & {
  total: number;
  u15: number;
  o15: number;
};

export type EventGroupStats = {
  key: string;
  label: string;
  icon: string;
  eventCount: number;
  totalVisits: number;
  averageVisits: number;
  u15Total: number;
  o15Total: number;
  bestEvent?: EventWithStats;
  events: EventWithStats[];
};

/**
 * Categorizes an event title into a logical group / category.
 */
export function categorizeEvent(title: string): { label: string; icon: string } {
  const lower = title.toLowerCase();

  if (lower.includes("kicker") || lower.includes("tischfußball") || lower.includes("wuzzel")) {
    return { label: "Kicker-Turniere", icon: "⚽" };
  }
  if (lower.includes("billard") || lower.includes("billiard") || lower.includes("pool")) {
    return { label: "Billard-Turniere", icon: "🎱" };
  }
  if (lower.includes("dart") || lower.includes("darts")) {
    return { label: "Dart-Turniere", icon: "🎯" };
  }
  if (lower.includes("tischtennis") || lower.includes("ping pong") || lower.includes("rundlauf")) {
    return { label: "Tischtennis", icon: "🏓" };
  }
  if (lower.includes("gaming") || lower.includes("zock") || lower.includes("fifa") || lower.includes("mario kart") || lower.includes("lan") || lower.includes("playstation")) {
    return { label: "Gaming & Konsole", icon: "🎮" };
  }
  if (lower.includes("kino") || lower.includes("film") || lower.includes("movie")) {
    return { label: "Kino & Filmabende", icon: "🎬" };
  }
  if (lower.includes("koch") || lower.includes("back") || lower.includes("pizza") || lower.includes("grill") || lower.includes("bbq") || lower.includes("waffel")) {
    return { label: "Kochen & Grillen", icon: "🍕" };
  }
  if (lower.includes("kreativ") || lower.includes("bastel") || lower.includes("malen") || lower.includes("töpfer") || lower.includes("workshop") || lower.includes("diy")) {
    return { label: "Workshops & Kreativ", icon: "🎨" };
  }
  if (lower.includes("sommerfest") || lower.includes("herbstfest") || lower.includes("weihnacht") || lower.includes("halloween") || lower.includes("fasching") || lower.includes("party") || lower.includes("fest") || lower.includes("feier") || lower.includes("jubiläum")) {
    return { label: "Feste & Partys", icon: "🎉" };
  }
  if (lower.includes("ausflug") || lower.includes("fahrt") || lower.includes("kletter") || lower.includes("zoo") || lower.includes("trip")) {
    return { label: "Ausflüge & Aktionen", icon: "🚌" };
  }
  if (lower.includes("turnier") || lower.includes("cup") || lower.includes("meisterschaft")) {
    return { label: "Wettkämpfe & Turniere", icon: "🏆" };
  }

  // Fallback: Clean title from years, dates and numbers
  const cleaned = title
    .replace(/\b(20\d\d)\b/g, "")
    .replace(/\b(im\s+[a-zäöü]+)\b/gi, "")
    .replace(/[#\d]+[.)]?/g, "")
    .replace(/[-–—/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const fallbackLabel = cleaned.length >= 3 ? cleaned : title.trim();
  return { label: fallbackLabel, icon: "📌" };
}

/**
 * Calculates comprehensive event analytics:
 * - Stats per single event (total, u15, o15)
 * - All-time best event
 * - Event groups ranked by average visits
 */
export function analyzeEventsAttendance(events: ChaxterEvent[], visits: TrackEvent[], days?: { date: string; u15: number; o15: number }[]) {
  // Aggregate visits by date
  const visitsByDate = new Map<string, { u15: number; o15: number; total: number }>();
  for (const visit of visits) {
    if ((visit as { cancelled?: boolean }).cancelled) continue;
    const dateKey = dayKey(new Date(visit.timestamp));
    const current = visitsByDate.get(dateKey) ?? { u15: 0, o15: 0, total: 0 };
    if (visit.group === "u15") current.u15++;
    else current.o15++;
    current.total++;
    visitsByDate.set(dateKey, current);
  }

  if (days) for (const day of days) visitsByDate.set(day.date, { u15: day.u15, o15: day.o15, total: day.u15 + day.o15 });

  // Connect each event with visit counts
  const eventsWithStats: EventWithStats[] = events.map((event) => {
    const stats = visitsByDate.get(event.date) ?? { u15: 0, o15: 0, total: 0 };
    return {
      ...event,
      total: stats.total,
      u15: stats.u15,
      o15: stats.o15,
    };
  });

  // Top single events sorted by total visits descending
  const topSingleEvents = [...eventsWithStats]
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total || b.date.localeCompare(a.date));

  const allTimeBestEvent = topSingleEvents[0] ?? null;

  // Group events by category
  const groupsMap = new Map<string, EventGroupStats>();
  for (const event of eventsWithStats) {
    const { label, icon } = categorizeEvent(event.title);
    const existing = groupsMap.get(label) ?? {
      key: label,
      label,
      icon,
      eventCount: 0,
      totalVisits: 0,
      averageVisits: 0,
      u15Total: 0,
      o15Total: 0,
      events: [],
    };

    existing.eventCount++;
    existing.totalVisits += event.total;
    existing.u15Total += event.u15;
    existing.o15Total += event.o15;
    existing.events.push(event);

    if (!existing.bestEvent || event.total > existing.bestEvent.total) {
      existing.bestEvent = event;
    }

    groupsMap.set(label, existing);
  }

  // Calculate averages and sort groups by average visits descending
  const eventGroups: EventGroupStats[] = Array.from(groupsMap.values()).map((g) => ({
    ...g,
    averageVisits: g.eventCount > 0 ? Math.round((g.totalVisits / g.eventCount) * 10) / 10 : 0,
  }));

  eventGroups.sort((a, b) => b.averageVisits - a.averageVisits || b.totalVisits - a.totalVisits);

  const bestEventGroup = eventGroups.find((g) => g.totalVisits > 0) ?? null;

  return {
    eventsWithStats,
    topSingleEvents,
    allTimeBestEvent,
    eventGroups,
    bestEventGroup,
  };
}
