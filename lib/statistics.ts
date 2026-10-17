import { dayKey, type TrackEvent } from "./tracking.ts";

export type Period = "day" | "week" | "month" | "year" | "all";
export type SeriesPoint = { key: string; label: string; u15: number; o15: number; total: number };
export const WEEKDAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
const hourFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" });

function calendarDate(day: string): Date {
  const date = new Date(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new Error("Ungültiges Kalenderdatum");
  }
  return date;
}
export function addDays(day: string, amount: number): string {
  const date = calendarDate(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function weekday(day: string) { return (calendarDate(day).getUTCDay() + 6) % 7; }
export function periodRange(period: Period, anchor: string): { start: string; end: string } | null {
  if (period === "all") return null;
  calendarDate(anchor);
  if (period === "day") return { start: anchor, end: anchor };
  if (period === "week") {
    const start = addDays(anchor, -weekday(anchor));
    return { start, end: addDays(start, 6) };
  }
  if (period === "month") {
    const start = `${anchor.slice(0, 7)}-01`;
    const next = calendarDate(start);
    next.setUTCMonth(next.getUTCMonth() + 1, 0);
    return { start, end: next.toISOString().slice(0, 10) };
  }
  return { start: `${anchor.slice(0, 4)}-01-01`, end: `${anchor.slice(0, 4)}-12-31` };
}
export function shiftPeriod(period: Period, anchor: string, direction: number): string {
  if (period === "all") return anchor;
  if (period === "day" || period === "week") return addDays(anchor, direction * (period === "week" ? 7 : 1));
  const date = calendarDate(period === "year" ? `${anchor.slice(0, 4)}-01-01` : `${anchor.slice(0, 7)}-01`);
  if (period === "year") date.setUTCFullYear(date.getUTCFullYear() + direction);
  else date.setUTCMonth(date.getUTCMonth() + direction);
  return date.toISOString().slice(0, 10);
}
const point = (key: string, label: string): SeriesPoint => ({ key, label, u15: 0, o15: 0, total: 0 });
function increment(item: SeriesPoint, event: TrackEvent) { item[event.group]++; item.total++; }

export function analyzeEvents(events: TrackEvent[], period: Period, anchor: string) {
  const range = periodRange(period, anchor);
  const visible: TrackEvent[] = [];
  const days = new Map<string, SeriesPoint>();
  const hours = Array.from({ length: 24 }, (_, index) => point(String(index), `${String(index).padStart(2, "0")}–${String(index + 1).padStart(2, "0")} Uhr`));
  const weekdays = WEEKDAYS.map((label, index) => ({ ...point(String(index), label), days: 0, average: 0 }));
  const counts = { u15: 0, o15: 0 };
  const enriched: { day: string; hour: number; event: TrackEvent }[] = [];
  for (const event of events) {
    const date = new Date(event.timestamp);
    const day = dayKey(date);
    if (range && (day < range.start || day > range.end)) continue;
    const hour = Number(hourFormatter.format(date));
    visible.push(event);
    enriched.push({ day, hour, event });
    counts[event.group]++;
    increment(hours[hour], event);
    if (!days.has(day)) days.set(day, point(day, day));
    increment(days.get(day)!, event);
  }
  visible.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || (b.order ?? 0) - (a.order ?? 0));
  const sortedDays = [...days.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const day of sortedDays) {
    const item = weekdays[weekday(day.key)];
    item.u15 += day.u15; item.o15 += day.o15; item.total += day.total; item.days++;
  }
  for (const item of weekdays) item.average = item.days ? item.total / item.days : 0;
  const bestAverage = Math.max(0, ...weekdays.map((item) => item.average));
  const bestHourCount = Math.max(0, ...hours.map((item) => item.total));
  const bestDayCount = Math.max(0, ...sortedDays.map((item) => item.total));
  const series = new Map<string, SeriesPoint>();
  const first = range?.start ?? sortedDays[0]?.key;
  const last = range?.end ?? sortedDays.at(-1)?.key;
  const yearsInsteadOfMonths = first && last ? Number(last.slice(0, 4)) * 12 + Number(last.slice(5, 7)) - Number(first.slice(0, 4)) * 12 - Number(first.slice(5, 7)) > 23 : false;
  let unit: "hour" | "day" | "month" | "year";
  if (period === "day") {
    unit = "hour";
    hours.forEach((item) => series.set(item.key, { ...item }));
  } else if (period === "week" || period === "month") {
    unit = "day";
    for (let day = first!; day <= last!; day = addDays(day, 1)) {
      const label = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", day: "2-digit", month: "2-digit" }).format(calendarDate(day));
      series.set(day, point(day, label));
    }
  } else {
    unit = period === "all" && yearsInsteadOfMonths ? "year" : "month";
    if (first && last) {
      if (unit === "year") {
        for (let year = Number(first.slice(0, 4)); year <= Number(last.slice(0, 4)); year++) series.set(String(year), point(String(year), String(year)));
      } else {
        const date = calendarDate(`${first.slice(0, 7)}-01`);
        while (date.getTime() <= calendarDate(last).getTime()) {
          const key = date.toISOString().slice(0, 7);
          const label = new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", month: "short", year: "2-digit" }).format(date);
          series.set(key, point(key, label));
          date.setUTCMonth(date.getUTCMonth() + 1);
        }
      }
    }
  }
  if (unit !== "hour") {
    for (const { day, event } of enriched) {
      const key = unit === "day" ? day : day.slice(0, unit === "year" ? 4 : 7);
      const item = series.get(key);
      if (item) increment(item, event);
    }
  }
  const topDays = [...sortedDays].sort((a, b) => b.total - a.total || b.key.localeCompare(a.key));
  return {
    range, events: visible, counts, total: visible.length, recordedDays: days.size,
    average: days.size ? visible.length / days.size : 0,
    weekdays, hours, series: [...series.values()], unit,
    bestWeekdays: bestAverage ? weekdays.filter((item) => item.average === bestAverage) : [],
    bestHours: bestHourCount ? hours.filter((item) => item.total === bestHourCount) : [],
    bestDays: bestDayCount ? sortedDays.filter((item) => item.total === bestDayCount) : [],
    topDays,
  };
}
