"use client";

import { useMemo } from "react";
import type { ChaxterEvent } from "@/lib/events";
import { analyzeEventDays, type EventDay } from "@/lib/event-analytics";

const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" });
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const weekdayName = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "long" });
const titles = (day: EventDay) => day.events.map((item) => item.title).join(" + ");

function Uplift({ value }: { value: number | null }) {
  if (value === null) return <span className="uplift" data-tone="none">–</span>;
  return <span className="uplift" data-tone={value > 0.05 ? "up" : value < -0.05 ? "down" : "flat"}>{percent.format(value)}</span>;
}

export default function EventPerformance({ events, days, onSelectDay }: {
  events: ChaxterEvent[];
  days: { date: string; u15: number; o15: number }[];
  onSelectDay?: (date: string) => void;
}) {
  const { eventDays, compared, averageUplift, best } = useMemo(() => analyzeEventDays(events, days), [events, days]);

  if (events.length === 0) {
    return <p className="events-empty">Noch keine Events eingetragen. Sobald unter „Events verwalten“ Events angelegt oder importiert sind, zeigt sich hier, ob sie mehr Besucher gebracht haben.</p>;
  }
  const past = eventDays.filter((day) => day.total > 0);

  return (
    <section className="event-performance-section" aria-label="Event-Auswertung">
      <p className="analytics-note">
        Jeder Event-Tag wird mit normalen Tagen desselben Wochentags verglichen (ohne Event, geöffnet, bis zu acht Wochen davor oder danach).
        Besuche lassen sich keinem einzelnen Event zuordnen; mehrere Events an einem Tag teilen sich dessen Besucher.
      </p>

      <div className="insight-grid insight-grid-2">
        <article className="analytics-panel insight-card">
          <h3>Event-Tage im Schnitt</h3>
          <strong>{averageUplift === null ? "Noch kein Vergleich" : `${percent.format(averageUplift)} Besuche`}</strong>
          <p>{averageUplift === null ? "Dafür braucht es Besuche am Event-Tag und an normalen gleichen Wochentagen." : `gegenüber normalen gleichen Wochentagen · ${compared} ${compared === 1 ? "Event-Tag" : "Event-Tage"} verglichen`}</p>
        </article>
        <article className="analytics-panel insight-card">
          <h3>Stärkstes Event</h3>
          <strong>{best ? titles(best) : "–"}</strong>
          <p>{best ? `${dayLabel(best.date)} · ${best.total} Besuche, ${percent.format(best.uplift!)} gegenüber einem normalen ${weekdayName(best.date)}` : "Erscheint, sobald ein Event-Tag verglichen werden kann."}</p>
        </article>
      </div>

      {past.length > 0 && (
        <div className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <h4>Alle Event-Tage</h4>
              <p>Besuche am Event-Tag, dahinter der Durchschnitt normaler Tage</p>
            </div>
          </div>
          <ol className="event-day-list">
            {past.map((day) => (
              <li key={day.date}>
                <button type="button" className="event-day-row" onClick={() => onSelectDay?.(day.date)} title="Diesen Tag in der Statistik anzeigen">
                  <span className="event-day-main">
                    <strong>{titles(day)}</strong>
                    <span>{dayLabel(day.date)}</span>
                  </span>
                  <span className="event-day-numbers">
                    <span className="event-day-total">{day.total}</span>
                    <span className="event-day-baseline">{day.baseline ? `sonst Ø ${number.format(day.baseline.total)}` : "kein Vergleichstag"}</span>
                  </span>
                  <Uplift value={day.uplift} />
                  {day.baseline && (
                    <span className="event-day-groups">
                      <span><i className="counter-blue" aria-hidden="true" />U15 {day.u15} <Uplift value={day.upliftU15} /></span>
                      <span><i className="counter-yellow" aria-hidden="true" />Ü15 {day.o15} <Uplift value={day.upliftO15} /></span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
