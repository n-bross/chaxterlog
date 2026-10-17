"use client";

import Link from "next/link";
import ChaxterLogo from "@/components/chaxter-logo";
import ActivityLog from "@/components/activity-log";
import EventsManager from "@/components/events-manager";
import { readRecords, type VisitRecord } from "@/lib/sync-state";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dayKey, readEvents, STORAGE_PREFIX, type TrackEvent } from "@/lib/tracking";
import { analyzeEvents, periodRange, shiftPeriod, type Period } from "@/lib/statistics";
import type { ChaxterEvent } from "@/lib/events";

import { useVisitSync } from "@/lib/use-visit-sync";
import SyncStatus from "@/components/sync-status";

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Tag" },
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
  { value: "year", label: "Jahr" },
  { value: "all", label: "Gesamt" },
];
const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

function rangeTitle(period: Period, anchor: string) {
  if (period === "all") return "Alle gespeicherten Besuche";
  if (!anchor) return "Zeitraum wird geladen …";
  const date = new Date(`${anchor}T12:00:00Z`);
  if (period === "day") return shortDate(anchor);
  if (period === "week") {
    const range = periodRange(period, anchor)!;
    return `${shortDate(range.start)} – ${shortDate(range.end)}`;
  }
  if (period === "year") return anchor.slice(0, 4);
  return date.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", month: "long", year: "numeric" });
}

type Bar = { key: string; label: string; value: number; u15?: number; o15?: number; detail?: string };
function Bars({ rows, label, stacked = false }: { rows: Bar[]; label: string; stacked?: boolean }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="analytics-bars" role="list" aria-label={label}>
      {rows.map((row) => (
        <div
          key={row.key}
          className="analytics-bar-row"
          role="listitem"
          aria-label={`${row.label}: ${number.format(row.value)}${row.detail ? `, ${row.detail}` : ""}`}
        >
          <span className="analytics-bar-label">{row.label}</span>
          <span className="analytics-bar-track" aria-hidden="true">
            <span className="analytics-bar-fill" style={{ width: `${(row.value / max) * 100}%` }}>
              {stacked ? (
                <>
                  <span className="counter-blue" style={{ flex: row.u15 ?? 0 }} />
                  <span className="counter-yellow" style={{ flex: row.o15 ?? 0 }} />
                </>
              ) : (
                <span className="counter-blue" style={{ flex: 1 }} />
              )}
            </span>
          </span>
          <span className="analytics-bar-value">{number.format(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Statistics() {
  const [anchor, setAnchor] = useState("");
  const [period, setPeriod] = useState<Period>("day");
  const [records, setRecords] = useState<VisitRecord[]>([]);
  const [events, setEvents] = useState<TrackEvent[]>([]);
  const [eventsList, setEventsList] = useState<ChaxterEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    try {
      setEvents(readEvents(localStorage));
      setRecords(readRecords(localStorage));
      setError(false);
    } catch {
      setError(true);
    }
    setLoaded(true);
  }, []);

  const syncStatus = useVisitSync(load);

  useEffect(() => {
    setAnchor(dayKey());
    load();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) load();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const stats = useMemo(() => analyzeEvents(events, period, anchor || "2000-01-01"), [events, period, anchor]);
  const range = useMemo(() => periodRange(period, anchor || "2000-01-01"), [period, anchor]);

  // When viewing a single day, show the week around this day in the trend instead of 24 empty hours
  const weekStats = useMemo(() => analyzeEvents(events, "week", anchor || "2000-01-01"), [events, anchor]);

  const eventsMap = useMemo(() => {
    const map = new Map<string, ChaxterEvent>();
    for (const ev of eventsList) {
      map.set(ev.date, ev);
    }
    return map;
  }, [eventsList]);

  const bestWeekday = stats.bestWeekdays[0];
  const bestDay = stats.bestDays[0];
  const bestDayEvent = bestDay ? eventsMap.get(bestDay.key) : undefined;
  const unitLabel = { hour: "Tage", day: "Tage", month: "Monate", year: "Jahre" }[stats.unit];
  const unitCaption = { hour: "Tag", day: "Tag", month: "Monat", year: "Jahr" }[stats.unit];

  function downloadPeriod(format: string) {
    const from = range ? range.start : "2000-01-01";
    const to = range ? range.end : "2099-12-31";
    return `/api/admin/export?${new URLSearchParams({ format, from, to })}`;
  }

  // Determine rows for Verlauf: always daily / monthly / yearly, NEVER hours
  const trendRows = useMemo(() => {
    if (period === "day") {
      return weekStats.series.map((item) => ({
        ...item,
        label: item.key === anchor ? `${item.label} (Dieser Tag)` : item.label,
        value: item.total,
        detail: `U15 ${item.u15}, Ü15 ${item.o15}`,
      }));
    }
    return stats.series.map((item) => ({
      ...item,
      value: item.total,
      detail: `U15 ${item.u15}, Ü15 ${item.o15}`,
    }));
  }, [period, anchor, weekStats.series, stats.series]);

  const maxTopDay = useMemo(() => Math.max(1, ...(stats.topDays?.map((d) => d.total) ?? [1])), [stats.topDays]);

  return (
    <main className="statistics-screen">
      <div className="statistics-brand">
        <ChaxterLogo />
        <SyncStatus status={syncStatus} />
      </div>

      <header className="flex items-center justify-between gap-4">
        <Link href="/" className="stats-button">
          ← Zählen
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Statistik</h1>
      </header>

      <div className="period-switch" role="group" aria-label="Zeitraum">
        {PERIODS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="period-navigation">
        <h2 aria-live="polite">{rangeTitle(period, anchor)}</h2>
        {period !== "all" && (
          <div className="period-controls">
            <button
              type="button"
              className="period-arrow"
              aria-label="Vorheriger Zeitraum"
              disabled={!anchor}
              onClick={() => setAnchor(shiftPeriod(period, anchor, -1))}
            >
              ←
            </button>
            <input
              type="date"
              aria-label="Datum im Zeitraum"
              value={anchor}
              onChange={(event) => {
                if (event.target.value) setAnchor(event.target.value);
              }}
              className="date-input"
            />
            <button
              type="button"
              className="period-arrow"
              aria-label="Nächster Zeitraum"
              disabled={!anchor}
              onClick={() => setAnchor(shiftPeriod(period, anchor, 1))}
            >
              →
            </button>
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="error-message">
          Browserspeicher nicht verfügbar.{" "}
          <button className="underline" onClick={load}>
            Erneut versuchen
          </button>
        </p>
      ) : (
        <>
          <section aria-label="Besuche im Zeitraum" className="statistics-totals">
            <div className="counter-blue">
              <span>U15</span>
              <strong>{loaded ? number.format(stats.counts.u15) : "–"}</strong>
            </div>
            <div className="counter-yellow">
              <span>Ü15</span>
              <strong>{loaded ? number.format(stats.counts.o15) : "–"}</strong>
            </div>
            <div className="statistics-total">
              <span>Gesamt</span>
              <strong>{loaded ? number.format(stats.total) : "–"}</strong>
            </div>
          </section>

          <p className="analytics-basis">
            {loaded
              ? `${stats.recordedDays} erfasste Tage · Ø ${number.format(stats.average)} Besuche pro erfasstem Tag`
              : "Daten werden geladen …"}
          </p>

          {/* Quick download links for period */}
          <div className="period-download-bar">
            <span className="muted" style={{ fontSize: "13px" }}>Zeitraum exportieren:</span>
            <a className="secondary-button btn-small" href={downloadPeriod("csv")} download>
              Einzelbesuche (CSV)
            </a>
            <a className="secondary-button btn-small" href={downloadPeriod("daily")} download>
              Tageswerte (CSV)
            </a>
            <a className="secondary-button btn-small" href={downloadPeriod("corrections")} download>
              Undo/Redo (CSV)
            </a>
          </div>

          {loaded && stats.total === 0 ? (
            <section className="analytics-empty">
              <h2>Noch keine Besuche</h2>
              <p>Für diesen Zeitraum sind keine Besuche gespeichert.</p>
            </section>
          ) : (
            loaded && (
              <>
                <section className="insight-grid" aria-label="Auswertung des Zeitraums">
                  <article className="analytics-panel insight-card">
                    <h3>Stärkster Wochentag</h3>
                    <strong>{stats.bestWeekdays.length > 1 ? "Gleichstand" : bestWeekday?.label ?? "–"}</strong>
                    <p>
                      {stats.bestWeekdays.length > 1
                        ? `${stats.bestWeekdays.map((day) => day.label).join(", ")} · `
                        : ""}
                      Ø {number.format(bestWeekday?.average ?? 0)} Besuche je erfasstem Wochentag
                    </p>
                  </article>
                  <article className="analytics-panel insight-card">
                    <h3>Bester Tag (Rekord)</h3>
                    <strong>
                      {stats.bestDays.length === 1
                        ? shortDate(bestDay.key)
                        : stats.bestDays.length > 1
                        ? `${stats.bestDays.length} Rekordtage`
                        : "–"}
                    </strong>
                    <p>
                      {stats.bestDays.length > 0
                        ? `${number.format(bestDay?.total ?? 0)} Besuche ${bestDayEvent ? `· 🎉 ${bestDayEvent.title}` : "(Höchstwert)"}`
                        : "Keine Besuche"}
                    </p>
                  </article>
                  <article className="analytics-panel insight-card">
                    <h3>Ø Besuche pro Tag</h3>
                    <strong>{number.format(stats.average)} Besuche</strong>
                    <p>
                      Durchschnitt an allen {stats.recordedDays} erfassten Tagen
                    </p>
                  </article>
                </section>

                <section className="analytics-panel trend-panel" aria-label="Besuchsverlauf">
                  <div className="analytics-panel-heading">
                    <div>
                      <h3>Verlauf</h3>
                      <p>
                        {period === "day"
                          ? `Woche um den ${shortDate(anchor)} · Besuche pro Tag`
                          : `Besuche pro ${unitCaption}`}
                      </p>
                    </div>
                    <div className="chart-legend">
                      <span>
                        <i className="counter-blue" />
                        U15
                      </span>
                      <span>
                        <i className="counter-yellow" />
                        Ü15
                      </span>
                    </div>
                  </div>
                  <Bars
                    stacked
                    label={period === "day" ? "Besuche der Tage um das Datum" : `Besuche nach ${unitLabel}`}
                    rows={trendRows}
                  />
                </section>

                <div className="analytics-chart-grid">
                  <section className="analytics-panel">
                    <div className="analytics-panel-heading">
                      <div>
                        <h3>Wochentage</h3>
                        <p>Ø Besuche pro erfasstem Wochentag</p>
                      </div>
                    </div>
                    <Bars
                      label="Durchschnitt nach Wochentag"
                      rows={stats.weekdays.map((item) => ({
                        ...item,
                        value: item.average,
                        detail: `${item.days} erfasste Tage, ${item.total} Besuche`,
                      }))}
                    />
                  </section>
                  <section className="analytics-panel best-days-panel">
                    <div className="analytics-panel-heading">
                      <div>
                        <h3>Beste Tage</h3>
                        <p>Rangliste der besucherstärksten Tage {period !== "all" ? "im Zeitraum" : ""}</p>
                      </div>
                    </div>
                    {!stats.topDays || stats.topDays.length === 0 ? (
                      <p className="text-xs text-muted py-3">Keine Besuchstage im gewählten Zeitraum.</p>
                    ) : (
                      <div className="analytics-bars" role="list" aria-label="Beste Besuchstage">
                        {stats.topDays.slice(0, 7).map((dayItem, index) => {
                          const medal = index === 0 ? "🥇 " : index === 1 ? "🥈 " : index === 2 ? "🥉 " : `#${index + 1} `;
                          const eventOnDay = eventsMap.get(dayItem.key);
                          return (
                            <div
                              key={dayItem.key}
                              className="analytics-bar-row best-day-row"
                              role="listitem"
                              onClick={() => {
                                setPeriod("day");
                                setAnchor(dayItem.key);
                              }}
                              title="Klicken, um diesen Tag detailliert anzuzeigen"
                            >
                              <span className="analytics-bar-label flex items-center gap-1.5 truncate">
                                <span className="font-semibold">{medal}</span>
                                <span>{shortDate(dayItem.key)}</span>
                                {eventOnDay && (
                                  <span className="best-day-event-tag" title={eventOnDay.title}>
                                    🎉 {eventOnDay.title}
                                  </span>
                                )}
                              </span>
                              <span className="analytics-bar-track" aria-hidden="true">
                                <span
                                  className="analytics-bar-fill"
                                  style={{ width: `${(dayItem.total / maxTopDay) * 100}%` }}
                                >
                                  <span className="counter-blue" style={{ flex: dayItem.u15 }} />
                                  <span className="counter-yellow" style={{ flex: dayItem.o15 }} />
                                </span>
                              </span>
                              <span className="analytics-bar-value">{number.format(dayItem.total)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              </>
            )
          )}

          {/* Events Manager section for entering events or importing lists/calendars */}
          <div id="events">
            <EventsManager
              highlightDate={anchor}
              onEventsChange={(evs) => setEventsList(evs)}
            />
          </div>

          {/* Unified chronological Activity Log showing visits, undos, and redos */}
          <ActivityLog records={records} range={range} />
        </>
      )}
    </main>
  );
}
