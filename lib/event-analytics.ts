import type { ChaxterEvent } from "./events.ts";

type DayTotals = { date: string; u15: number; o15: number };

export type EventDay = {
  date: string;
  events: ChaxterEvent[];
  u15: number;
  o15: number;
  total: number;
  // Average of comparable normal days: same weekday, no event, café open, within ±8 weeks.
  baseline: { u15: number; o15: number; total: number; days: number } | null;
  // Relative difference to the baseline, e.g. 0.35 for +35 %; null without a comparison.
  uplift: number | null;
  upliftU15: number | null;
  upliftO15: number | null;
};

const WINDOW_DAYS = 56;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
const relative = (value: number, base: number) => (base > 0 ? value / base - 1 : null);

/**
 * Compares every day with an event against normal days. Visits are not tied to a single event,
 * so several events on one day form one event day and share its visitors.
 */
export function analyzeEventDays(events: ChaxterEvent[], days: DayTotals[]) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const eventsByDate = new Map<string, ChaxterEvent[]>();
  for (const event of events) eventsByDate.set(event.date, [...(eventsByDate.get(event.date) ?? []), event]);
  const normalDays = days.filter((day) => !eventsByDate.has(day.date) && day.u15 + day.o15 > 0);

  const eventDays: EventDay[] = [...eventsByDate].map(([date, dayEvents]) => {
    const visits = byDate.get(date) ?? { u15: 0, o15: 0 };
    const position = dayNumber(date);
    const comparable = normalDays.filter((day) => {
      const distance = dayNumber(day.date) - position;
      return distance % 7 === 0 && Math.abs(distance) <= WINDOW_DAYS;
    });
    const sum = comparable.reduce((acc, day) => ({ u15: acc.u15 + day.u15, o15: acc.o15 + day.o15 }), { u15: 0, o15: 0 });
    const baseline = comparable.length
      ? { u15: sum.u15 / comparable.length, o15: sum.o15 / comparable.length, total: (sum.u15 + sum.o15) / comparable.length, days: comparable.length }
      : null;
    const total = visits.u15 + visits.o15;
    const measured = total > 0 && baseline;
    return {
      date,
      events: dayEvents,
      u15: visits.u15,
      o15: visits.o15,
      total,
      baseline,
      uplift: measured ? relative(total, baseline.total) : null,
      upliftU15: measured ? relative(visits.u15, baseline.u15) : null,
      upliftO15: measured ? relative(visits.o15, baseline.o15) : null,
    };
  }).sort((a, b) => b.date.localeCompare(a.date));

  const compared = eventDays.filter((day) => day.uplift !== null);
  const averageUplift = compared.length ? compared.reduce((sum, day) => sum + day.uplift!, 0) / compared.length : null;
  const best = [...compared].sort((a, b) => b.uplift! - a.uplift! || b.total - a.total)[0] ?? null;
  return { eventDays, compared: compared.length, averageUplift, best };
}
