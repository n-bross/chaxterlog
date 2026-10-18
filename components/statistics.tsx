"use client";

import Link from "next/link";
import ChaxterLogo from "@/components/chaxter-logo";
import ActivityLog from "@/components/activity-log";
import EventsManager from "@/components/events-manager";
import EventPerformance from "@/components/event-performance";
import { readRecords, type VisitRecord } from "@/lib/sync-state";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dayKey, readEvents, STORAGE_PREFIX, type TrackEvent } from "@/lib/tracking";
import { analyzeEvents, periodRange, shiftPeriod, addDays, type Period } from "@/lib/statistics";
import type { ChaxterEvent } from "@/lib/events";
import { exportSummaryGraphic, exportSingleChartGraphic } from "@/lib/chart-export";

import { useVisitSync } from "@/lib/use-visit-sync";
import SyncStatus from "@/components/sync-status";
import { Accordion } from "./interior/accordion";
import { SegmentedControl } from "./interior/segmented-control";
import { Modal } from "./interior/modal";
import { LoadingButton } from "./interior/loading-button";

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Tag" },
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
  { value: "year", label: "Jahr" },
  { value: "custom", label: "Zeitraum" },
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

function rangeTitle(period: Period, anchor: string, customEnd?: string) {
  if (period === "all") return "Alle gespeicherten Besuche";
  if (period === "custom") {
    if (!anchor || !customEnd) return "Eigener Zeitraum";
    return `${shortDate(anchor)} – ${shortDate(customEnd)}`;
  }
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

function StatisticsSection({ title, description, children }: {
  title: string; description: string; children: React.ReactNode;
}) {
  return <Accordion className="statistics-accordion" headingLevel={2} maxPanelHeight={100000}
    items={[{ id: "section", title: <span className="statistics-section-heading"><span>{title}</span><span>{description}</span></span>, content: children }]} />;
}

export default function Statistics() {
  const [anchor, setAnchor] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [period, setPeriod] = useState<Period>("day");
  const [records, setRecords] = useState<VisitRecord[]>([]);
  const [events, setEvents] = useState<TrackEvent[]>([]);
  const [eventsList, setEventsList] = useState<ChaxterEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Download export state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

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
    const today = dayKey();
    setAnchor(today);
    setCustomEnd(today);
    setCustomStart(addDays(today, -29));
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

  const activeAnchor = period === "custom" ? (customStart || "2000-01-01") : (anchor || "2000-01-01");
  const activeCustomEnd = period === "custom" ? (customEnd || anchor || "2099-12-31") : undefined;

  const stats = useMemo(
    () => analyzeEvents(events, period, activeAnchor, activeCustomEnd),
    [events, period, activeAnchor, activeCustomEnd]
  );
  const range = useMemo(
    () => periodRange(period, activeAnchor, activeCustomEnd),
    [period, activeAnchor, activeCustomEnd]
  );

  // When viewing a single day, show the week around this day in the trend instead of 24 empty hours
  const weekStats = useMemo(() => analyzeEvents(events, "week", activeAnchor), [events, activeAnchor]);

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

  const currentDisplayTitle = rangeTitle(period, activeAnchor, activeCustomEnd);
  const invalidExportRange = Boolean(exportFrom && exportTo && exportFrom > exportTo);

  async function handleDownload(format: string) {
    const params = new URLSearchParams({ format });
    if (exportFrom) params.set("from", exportFrom);
    if (exportTo) params.set("to", exportTo);

    const response = await fetch(`/api/admin/export?${params.toString()}`);
    if (!response.ok) {
      throw new Error("Export fehlgeschlagen");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition");
    let filename = `chaxterlog-${format}${exportFrom ? `-${exportFrom}` : ""}${exportTo ? `-bis-${exportTo}` : ""}.${format === "json" ? "json" : "csv"}`;
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match?.[1]) filename = match[1];
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      <header className="manage-header statistics-header">
        <Link className="back-link" href="/">
          ← Zählung
        </Link>
        <h1>Statistik</h1>
        <div className="statistics-header-right">
          <button
            type="button"
            className="statistics-export-btn"
            aria-label="Daten & Grafiken herunterladen"
            title="Daten & Grafiken herunterladen"
            onClick={() => {
              if (range) {
                setExportFrom(range.start);
                setExportTo(range.end);
              }
              setExportOpen(true);
            }}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
            </svg>
          </button>
          <div className="account-brand">
            <ChaxterLogo />
          </div>
          <SyncStatus status={syncStatus} />
        </div>
      </header>

      <SegmentedControl className="period-switch" label="Zeitraum" options={PERIODS} value={period} onValueChange={(value) => setPeriod(value as Period)} />

      <div className="period-navigation">
        <h2 aria-live="polite">{currentDisplayTitle}</h2>
        {period === "custom" ? (
          <div className="period-custom-controls">
            <label className="period-custom-field">
              <span>Von</span>
              <input
                type="date"
                value={customStart}
                onChange={(event) => {
                  if (event.target.value) setCustomStart(event.target.value);
                }}
                className="date-input"
              />
            </label>
            <label className="period-custom-field">
              <span>Bis</span>
              <input
                type="date"
                value={customEnd}
                onChange={(event) => {
                  if (event.target.value) setCustomEnd(event.target.value);
                }}
                className="date-input"
              />
            </label>
          </div>
        ) : period !== "all" ? (
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
        ) : null}
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

          {loaded && stats.total > 0 && (
            <>
              <StatisticsSection title="Kennzahlen" description="Rekorde, Durchschnitt und stärkster Wochentag">
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
              </StatisticsSection>

              <StatisticsSection title="Besuchsverlauf" description="Entwicklung der Besuche im gewählten Zeitraum">
                <section className="analytics-panel trend-panel" aria-label="Besuchsverlauf">
                  <div className="analytics-panel-heading">
                    <div>
                      <h3>Verlauf</h3>
                      <p>Besuche pro {unitCaption}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="chart-download-btn"
                        title="Verlaufsdiagramm als PNG herunterladen"
                        aria-label="Verlaufsdiagramm als PNG herunterladen"
                        onClick={() =>
                          exportSingleChartGraphic(
                            "Besuchsverlauf",
                            currentDisplayTitle,
                            trendRows,
                            `besuchsverlauf-${range?.start ?? "zeitraum"}.png`,
                            true
                          )
                        }
                      >
                        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                        Grafik (PNG)
                      </button>
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
                  </div>
                  <Bars
                    stacked
                    label={`Besuche nach ${unitLabel}`}
                    rows={trendRows}
                  />
                </section>
              </StatisticsSection>

              <StatisticsSection title="Wochentage & beste Tage" description="Wochentagsvergleich und Rangliste der Besuchstage">
                <div className="analytics-chart-grid">
                  <section className="analytics-panel">
                    <div className="analytics-panel-heading">
                      <div>
                        <h3>Wochentage</h3>
                        <p>Ø Besuche pro erfasstem Wochentag</p>
                      </div>
                      <button
                        type="button"
                        className="chart-download-btn"
                        title="Wochentage-Diagramm als PNG herunterladen"
                        aria-label="Wochentage-Diagramm als PNG herunterladen"
                        onClick={() =>
                          exportSingleChartGraphic(
                            "Wochentagsvergleich (Durchschnitt)",
                            currentDisplayTitle,
                            stats.weekdays.map((w) => ({ label: w.label, value: w.average, detail: `${w.days} erfasste Tage` })),
                            `wochentage-${range?.start ?? "zeitraum"}.png`,
                            false
                          )
                        }
                      >
                        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                        Grafik (PNG)
                      </button>
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
                  <section className="analytics-panel">
                    <div className="analytics-panel-heading">
                      <div>
                        <h3>Beste Besuchstage</h3>
                        <p>Höchste Besucherzahlen im Zeitraum</p>
                      </div>
                    </div>
                    {stats.topDays && (
                      <div className="analytics-bars" role="list" aria-label="Beste Besuchstage">
                        {stats.topDays.map((dayItem, index) => {
                          const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `${index + 1}.`;
                          const eventOnDay = eventsMap.get(dayItem.key);
                          return (
                            <div
                              key={dayItem.key}
                              className="analytics-bar-row"
                              role="listitem"
                              aria-label={`${index + 1}. Platz: ${shortDate(dayItem.key)}, ${number.format(dayItem.total)} Besuche`}
                            >
                              <span className="analytics-bar-label flex items-center gap-1.5">
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
              </StatisticsSection>
            </>
          )}

          <StatisticsSection title="Event-Auswertung" description="Besuche bei einzelnen Events und Event-Kategorien">
            <EventPerformance events={eventsList} visits={events} onSelectDay={(d) => { setPeriod("day"); setAnchor(d); }} />
          </StatisticsSection>
          <div id="events">
            <StatisticsSection title="Events verwalten" description="Events eintragen, bearbeiten oder importieren">
              <EventsManager highlightDate={anchor} onEventsChange={setEventsList} />
            </StatisticsSection>
          </div>
          <StatisticsSection title="Aktivitätsprotokoll" description="Einzelne Besuche und Undo-/Redo-Korrekturen">
            <ActivityLog records={records} range={range} />
          </StatisticsSection>
        </>
      )}

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Daten & Grafiken herunterladen"
        description="CSV-, JSON- und Bild-Exporte der Auswertungen und Besuchsdaten."
        maxWidth={500}
      >
        <div className="download-modal-body">
          <div className="form-row">
            <label>
              Von
              <input
                type="date"
                value={exportFrom}
                onChange={(e) => setExportFrom(e.target.value)}
              />
            </label>
            <label>
              Bis
              <input
                type="date"
                value={exportTo}
                onChange={(e) => setExportTo(e.target.value)}
              />
            </label>
          </div>

          <div className="download-preset-chips">
            <button
              type="button"
              className="download-chip"
              onClick={() => {
                if (range) {
                  setExportFrom(range.start);
                  setExportTo(range.end);
                }
              }}
            >
              Gewählter Zeitraum ({currentDisplayTitle})
            </button>
            <button
              type="button"
              className="download-chip"
              onClick={() => {
                setExportFrom("");
                setExportTo("");
              }}
            >
              Gesamter Datenbestand
            </button>
          </div>

          {invalidExportRange ? (
            <p role="alert" className="error-message">
              Das Enddatum liegt vor dem Anfangsdatum.
            </p>
          ) : (
            <>
              <div className="download-section-heading">CSV- &amp; JSON-Exporte</div>
              <div className="button-row download-button-group">
                <LoadingButton
                  className="primary-button"
                  onAction={() => handleDownload("csv")}
                  pendingLabel="Erstelle CSV …"
                  successLabel="Heruntergeladen"
                  errorLabel="Fehlgeschlagen"
                >
                  Einzelbesuche · CSV
                </LoadingButton>
                <LoadingButton
                  className="secondary-button"
                  onAction={() => handleDownload("daily")}
                  pendingLabel="Erstelle CSV …"
                  successLabel="Heruntergeladen"
                  errorLabel="Fehlgeschlagen"
                >
                  Tageswerte · CSV
                </LoadingButton>
                <LoadingButton
                  className="secondary-button"
                  onAction={() => handleDownload("corrections")}
                  pendingLabel="Erstelle CSV …"
                  successLabel="Heruntergeladen"
                  errorLabel="Fehlgeschlagen"
                >
                  Undo &amp; Redo · CSV
                </LoadingButton>
                <LoadingButton
                  className="secondary-button"
                  onAction={() => handleDownload("json")}
                  pendingLabel="Erstelle JSON …"
                  successLabel="Heruntergeladen"
                  errorLabel="Fehlgeschlagen"
                >
                  Alle Details · JSON
                </LoadingButton>
              </div>

              <div className="download-section-heading" style={{ marginTop: 12 }}>Grafik-Export</div>
              <div className="button-row">
                <LoadingButton
                  className="secondary-button w-full"
                  onAction={async () => {
                    exportSummaryGraphic({
                      title: "ChaxterLog Statistik",
                      subtitle: currentDisplayTitle,
                      counts: { ...stats.counts, total: stats.total },
                      average: stats.average,
                      recordedDays: stats.recordedDays,
                      trendRows,
                      trendUnitCaption: unitCaption,
                      weekdays: stats.weekdays,
                      topDays: stats.topDays?.map((d) => ({ key: d.key, total: d.total, u15: d.u15, o15: d.o15 })),
                    }, `chaxterlog-grafik-${exportFrom || range?.start || "zeitraum"}.png`);
                  }}
                  pendingLabel="Erstelle Grafik …"
                  successLabel="Heruntergeladen"
                  errorLabel="Fehlgeschlagen"
                >
                  Statistik-Grafik (PNG) · Infografik
                </LoadingButton>
              </div>
            </>
          )}
        </div>
      </Modal>
    </main>
  );
}
