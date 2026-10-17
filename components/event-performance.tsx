"use client";

import { useMemo } from "react";
import type { ChaxterEvent } from "@/lib/events";
import type { TrackEvent } from "@/lib/tracking";
import { analyzeEventsAttendance, type EventGroupStats, type EventWithStats } from "@/lib/event-analytics";

const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

interface EventPerformanceProps {
  events: ChaxterEvent[];
  visits: TrackEvent[];
  onSelectDay?: (date: string) => void;
}

export default function EventPerformance({ events, visits, onSelectDay }: EventPerformanceProps) {
  const analysis = useMemo(() => analyzeEventsAttendance(events, visits), [events, visits]);

  const maxGroupAverage = useMemo(() => {
    return Math.max(1, ...analysis.eventGroups.map((g) => g.averageVisits));
  }, [analysis.eventGroups]);

  const maxSingleTotal = useMemo(() => {
    return Math.max(1, ...analysis.topSingleEvents.map((e) => e.total));
  }, [analysis.topSingleEvents]);

  if (events.length === 0) {
    return null;
  }

  return (
    <section className="event-performance-section analytics-panel" aria-label="Event-Auswertung & Erfolge">
      <div className="analytics-panel-heading">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <span>🏆</span> Event-Auswertung: Was läuft am besten?
          </h3>
          <p className="text-xs text-muted">
            All-Time Rekord-Events und Vergleich der beliebtesten Event-Gruppen (z. B. Kicker, Billard, Feste)
          </p>
        </div>
        <span className="analytics-basis">{events.length} Events erfasst</span>
      </div>

      {/* Highlight Cards */}
      <div className="insight-grid mt-3">
        <article className="analytics-panel insight-card">
          <h3>All-Time Rekord-Event</h3>
          <strong>
            {analysis.allTimeBestEvent
              ? `${analysis.allTimeBestEvent.title}`
              : "Noch keine Besuchsdaten"}
          </strong>
          <p>
            {analysis.allTimeBestEvent
              ? `${shortDate(analysis.allTimeBestEvent.date)} · ${analysis.allTimeBestEvent.total} Besuche (U15: ${analysis.allTimeBestEvent.u15}, Ü15: ${analysis.allTimeBestEvent.o15})`
              : "Sobald Besuche für Event-Tage erfasst sind, erscheint hier der Rekord."}
          </p>
        </article>

        <article className="analytics-panel insight-card">
          <h3>Beste Event-Gruppe (Ø Besuche)</h3>
          <strong>
            {analysis.bestEventGroup
              ? `${analysis.bestEventGroup.icon} ${analysis.bestEventGroup.label}`
              : "Noch keine Besuchsdaten"}
          </strong>
          <p>
            {analysis.bestEventGroup
              ? `Ø ${number.format(analysis.bestEventGroup.averageVisits)} Besuche pro Event (${analysis.bestEventGroup.eventCount} Events · ${analysis.bestEventGroup.totalVisits} Gesamtbesuche)`
              : "Beliebteste Kategorie nach durchschnittlichen Besucherzahlen."}
          </p>
        </article>
      </div>

      {/* Two Columns: Event-Gruppen vs. Beste Einzelevents */}
      <div className="analytics-chart-grid mt-4">
        {/* Left Column: Event-Gruppen (Kicker vs Billard vs Feste) */}
        <section className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <h4 className="text-sm font-semibold">Event-Gruppen im Vergleich</h4>
              <p className="text-xs text-muted">Ø Besucher pro Event-Kategorie</p>
            </div>
          </div>

          {analysis.eventGroups.length === 0 ? (
            <p className="text-xs text-muted py-3">Keine Event-Gruppen vorhanden.</p>
          ) : (
            <div className="analytics-bars" role="list" aria-label="Event-Gruppen Vergleich">
              {analysis.eventGroups.map((group, index) => {
                const medal = index === 0 ? "🥇 " : index === 1 ? "🥈 " : index === 2 ? "🥉 " : `#${index + 1} `;
                return (
                  <div
                    key={group.key}
                    className="analytics-bar-row"
                    role="listitem"
                    title={`${group.eventCount} Event(s) durchgeführt, ${group.totalVisits} Besuche gesamt`}
                  >
                    <span className="analytics-bar-label flex items-center gap-1.5 truncate">
                      <span className="font-semibold text-xs">{medal}</span>
                      <span>{group.icon}</span>
                      <span className="truncate">{group.label}</span>
                    </span>
                    <span className="analytics-bar-track" aria-hidden="true">
                      <span
                        className="analytics-bar-fill"
                        style={{ width: `${(group.averageVisits / maxGroupAverage) * 100}%` }}
                      >
                        <span className="counter-blue" style={{ flex: group.u15Total }} />
                        <span className="counter-yellow" style={{ flex: group.o15Total }} />
                      </span>
                    </span>
                    <span className="analytics-bar-value flex items-center gap-1">
                      <span>Ø {number.format(group.averageVisits)}</span>
                      <small className="text-muted text-[11px]">({group.eventCount}×)</small>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Top Einzelevents All-Time */}
        <section className="analytics-panel">
          <div className="analytics-panel-heading">
            <div>
              <h4 className="text-sm font-semibold">Beste Einzelevents (All-Time)</h4>
              <p className="text-xs text-muted">Die besucherstärksten Event-Tage</p>
            </div>
          </div>

          {analysis.topSingleEvents.length === 0 ? (
            <p className="text-xs text-muted py-3">Noch keine Besuchsdaten an Event-Tagen.</p>
          ) : (
            <div className="analytics-bars" role="list" aria-label="Beste Einzelevents">
              {analysis.topSingleEvents.slice(0, 7).map((ev, index) => {
                const medal = index === 0 ? "🥇 " : index === 1 ? "🥈 " : index === 2 ? "🥉 " : `#${index + 1} `;
                return (
                  <div
                    key={ev.id}
                    className="analytics-bar-row best-day-row"
                    role="listitem"
                    onClick={() => onSelectDay?.(ev.date)}
                    style={{ cursor: onSelectDay ? "pointer" : "default" }}
                    title="Klicken, um diesen Event-Tag in der Statistik anzuzeigen"
                  >
                    <span className="analytics-bar-label flex items-center gap-1.5 truncate">
                      <span className="font-semibold text-xs">{medal}</span>
                      <span className="truncate font-medium">{ev.title}</span>
                      <small className="text-muted text-[11px] whitespace-nowrap">({shortDate(ev.date)})</small>
                    </span>
                    <span className="analytics-bar-track" aria-hidden="true">
                      <span
                        className="analytics-bar-fill"
                        style={{ width: `${(ev.total / maxSingleTotal) * 100}%` }}
                      >
                        <span className="counter-blue" style={{ flex: ev.u15 }} />
                        <span className="counter-yellow" style={{ flex: ev.o15 }} />
                      </span>
                    </span>
                    <span className="analytics-bar-value">{number.format(ev.total)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
