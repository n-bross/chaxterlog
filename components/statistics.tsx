"use client";

import Link from "next/link";
import { listDays, listEvents } from "@/lib/client-data";
import type { DailyAggregate } from "@/lib/aggregation";
import EventAnalytics from "@/components/event-analytics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dayKey } from "@/lib/tracking";
import { analyzeAggregates, periodRange, previousRange, shiftPeriod, addDays, type Period, type SeriesPoint } from "@/lib/statistics";
import { StatisticGraphic, DownloadIcon } from "./statistic-graphic";
import { analyzeEventDays } from "@/lib/event-analytics";
import type { ChaxterEvent } from "@/lib/events";
import ComboChart from "./combo-chart";

import { Accordion } from "./interior/accordion";
import { SegmentedControl } from "./interior/segmented-control";
import { useAsyncAction } from "./interior/loading-button";

type ViewPeriod = Exclude<Period, "all">;
const PERIODS: { value: ViewPeriod; label: string }[] = [
  { value: "day", label: "Tag" },
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
  { value: "year", label: "Jahr" },
  { value: "custom", label: "Zeitraum" },
];
const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 });
const change = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" });
const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
const share = (part: number, total: number) => (total ? part / total : 0);

function rangeTitle(period: ViewPeriod, anchor: string, customEnd?: string) {
  if (period === "custom") return anchor && customEnd ? `${shortDate(anchor)} – ${shortDate(customEnd)}` : "Eigener Zeitraum";
  if (!anchor) return "Zeitraum wird geladen …";
  if (period === "day") return shortDate(anchor);
  if (period === "week") {
    const range = periodRange(period, anchor)!;
    return `${shortDate(range.start)} – ${shortDate(range.end)}`;
  }
  if (period === "year") return anchor.slice(0, 4);
  return new Date(`${anchor}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", month: "long", year: "numeric" });
}

type Bar = { key: string; label: string; u15: number; o15: number; value: number; detail?: string };
// "count" draws bars against the largest row; "share" fills every row and shows how U15 and Ü15 split it.
function Bars({ rows, label, mode = "count" }: { rows: Bar[]; label: string; mode?: "count" | "share" }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="analytics-bars" role="list" aria-label={label}>
      {rows.map((row) => {
        const total = row.u15 + row.o15;
        const width = mode === "share" ? (total ? 100 : 0) : (row.value / max) * 100;
        return (
          <div key={row.key} className="analytics-bar-row" role="listitem"
            aria-label={`${row.label}: ${number.format(row.value)}${row.detail ? `, ${row.detail}` : ""}${total ? `, ${percent.format(share(row.u15, total))} U15` : ""}`}>
            <span className="analytics-bar-label">{row.label}</span>
            <span className="analytics-bar-track" aria-hidden="true">
              <span className="analytics-bar-fill" style={{ width: `${width}%` }}>
                <span className="counter-blue" style={{ flex: row.u15 }} />
                <span className="counter-yellow" style={{ flex: row.o15 }} />
              </span>
            </span>
            <span className="analytics-bar-value">
              {mode === "share"
                ? (total ? <>{percent.format(share(row.u15, total))}<small className="bar-value-note"> U15</small></> : "–")
                : number.format(row.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="chart-legend" aria-hidden="true">
      <span><i className="counter-blue" />U15</span>
      <span><i className="counter-yellow" />Ü15</span>
    </div>
  );
}

function FoldedSection({ id, title, description, children }: { id?: string; title: string; description: string; children: React.ReactNode }) {
  const [open, setOpen] = useState<readonly string[]>([]);
  useEffect(() => { if (id && window.location.hash === `#${id}`) setOpen(["section"]); }, [id]);
  return <div id={id}><Accordion className="statistics-accordion" headingLevel={2} maxPanelHeight={100000} open={open} onOpenChange={setOpen}
    items={[{ id: "section", title: <span className="statistics-section-heading"><span>{title}</span><span>{description}</span></span>, content: open.includes("section") ? children : null }]} /></div>;
}

const longDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
const monthName = (key: string) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC", month: "long", year: "numeric" });
const weekdayName = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", weekday: "long" });

function Highlight({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <StatisticGraphic as="article" className="highlight-card" title={label}>
      <span className="meta">{label}</span>
      <strong title={value}>{value}</strong>
      <p>{detail}</p>
    </StatisticGraphic>
  );
}

const peak = <T extends { u15: number; o15: number }>(rows: T[], group: "u15" | "o15") =>
  rows.reduce<T | null>((best, row) => (row[group] > (best?.[group] ?? 0) ? row : best), null);

export default function Statistics() {
  const [anchor, setAnchor] = useState("");
  const [today, setToday] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [period, setPeriod] = useState<ViewPeriod>("month");
  const [ageMode, setAgeMode] = useState<"count" | "share">("count");
  const requestId = useRef(0);
  const [days, setDays] = useState<DailyAggregate[]>([]);
  const [events, setEvents] = useState<ChaxterEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [error, setError] = useState(false);

  const [downloadError, setDownloadError] = useState(false);

  useEffect(() => {
    const now = dayKey(); setToday(now); setAnchor(now); setCustomEnd(now); setCustomStart(addDays(now, -29));
  }, []);

  const activeAnchor = period === "custom" ? (customStart || "2000-01-01") : (anchor || "2000-01-01");
  const activeCustomEnd = period === "custom" ? (customEnd || anchor || "2099-12-31") : undefined;
  const range = useMemo(() => periodRange(period, activeAnchor, activeCustomEnd)!, [period, activeAnchor, activeCustomEnd]);
  const previous = useMemo(() => previousRange(period, activeAnchor, activeCustomEnd, today || undefined)!, [period, activeAnchor, activeCustomEnd, today]);

  // One request covers the period, the period it is compared with, and (for a day) its week.
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoaded(false);
    try {
      const week = periodRange("week", activeAnchor)!;
      const from = [range.start, previous.start, period === "day" ? week.start : range.start].sort()[0];
      const to = [range.end, period === "day" ? week.end : range.end].sort()[1];
      const [result, periodEvents] = await Promise.all([listDays(from, to), listEvents(range.start, range.end)]);
      if (id === requestId.current) { setDays(result); setEvents(periodEvents); setError(false); setLoaded(true); setLoadedAt(new Date()); }
    } catch { if (id === requestId.current) setError(true); }
  }, [range, previous, period, activeAnchor]);
  useEffect(() => { if (anchor) void load(); }, [load, anchor]);

  const stats = useMemo(() => analyzeAggregates(days, period, activeAnchor, activeCustomEnd), [days, period, activeAnchor, activeCustomEnd]);
  const before = useMemo(() => analyzeAggregates(days, "custom", previous.start, previous.end), [days, previous]);
  // Highlights for the chosen period: the busiest event day, the busiest day and, for a year, the busiest month.
  const bestEvent = useMemo(() => analyzeEventDays(events.filter((e) => e.date >= range.start && e.date <= range.end), days)
    .eventDays.filter((day) => day.total > 0).sort((a, b) => b.total - a.total || b.date.localeCompare(a.date))[0] ?? null, [events, days, range]);
  const bestDay = stats.topDays.find((day) => day.total > 0) ?? null;
  const bestDayEvents = bestDay ? events.filter((e) => e.date === bestDay.key) : [];
  const bestMonth = stats.unit === "month" ? stats.series.reduce<SeriesPoint | null>((best, month) => (month.total > (best?.total ?? 0) ? month : best), null) : null;
  const bestMonthDays = bestMonth ? stats.topDays.filter((day) => day.key.startsWith(bestMonth.key) && day.total > 0).length : 0;
  const chartPoints = useMemo(() => stats.series.map((item) => ({
    ...item,
    title: stats.unit === "day" ? longDay(item.key) : stats.unit === "month" ? monthName(item.key) : item.label,
    future: Boolean(today) && item.key > today.slice(0, item.key.length),
  })), [stats.series, stats.unit, today]);

  const change_ = before.total ? stats.total / before.total - 1 : null;

  const unitCaption = { hour: "Tag", day: "Tag", month: "Monat", year: "Jahr" }[stats.unit];
  const currentDisplayTitle = rangeTitle(period, activeAnchor, activeCustomEnd);

  async function handleDownload() {
    setDownloadError(false);
    const params = new URLSearchParams({ format: "daily", from: range.start, to: range.end });
    const response = await fetch(`/api/admin/export?${params.toString()}`);
    if (!response.ok) throw new Error("Export fehlgeschlagen");
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition");
    let filename = `chaxterlog-${range.start}-${range.end}.csv`;
    const match = disposition?.match(/filename="?([^";]+)"?/);
    if (match?.[1]) filename = match[1];
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const download = useAsyncAction({ action: handleDownload, onError: () => setDownloadError(true) });

  const weekdayRows = useMemo(() => stats.weekdays.filter((day) => day.days > 0).map((day) => ({
    ...day,
    u15: day.u15 / day.days,
    o15: day.o15 / day.days,
    value: day.average,
    detail: `${day.days} ${day.days === 1 ? "Öffnungstag" : "Öffnungstage"}`,
  })), [stats.weekdays]);
  const dayU15 = peak(weekdayRows, "u15"), dayO15 = peak(weekdayRows, "o15");

  return (
    <main className="statistics-screen">
      <header className="manage-header statistics-header">
        <Link className="back-link" href="/">
          <span className="back-arrow" aria-hidden="true">←</span> Zählung
        </Link>
        <h1>Statistik</h1>
        <div className="statistics-header-right">
          <button type="button" className="icon-button statistics-export-btn" aria-label="Ausgewählten Zeitraum als CSV herunterladen" title="Ausgewählten Zeitraum als CSV herunterladen"
            disabled={!loaded || error || download.pending} aria-busy={download.pending} onClick={download.run}>
            <DownloadIcon />
          </button>
          <span className="meta" title="Zeitpunkt, zu dem die Werte geladen wurden">{loaded && loadedAt ? `Stand ${loadedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : "Lädt …"}</span>
        </div>
      </header>

      {downloadError && <p role="alert" className="error-message">CSV konnte nicht heruntergeladen werden. Bitte erneut versuchen.</p>}

      <SegmentedControl className="period-switch" label="Zeitraum" options={PERIODS} value={period} onValueChange={(value) => setPeriod(value as ViewPeriod)} />

      <div className="period-navigation">
        <h2 aria-live="polite">{currentDisplayTitle}</h2>
        {period === "custom" ? (
          <div className="period-custom-controls">
            <label className="period-custom-field">
              <span>Von</span>
              <input type="date" value={customStart} max={customEnd || undefined}
                onChange={(event) => { const value = event.target.value; if (!value) return; setCustomStart(value); if (customEnd && value > customEnd) setCustomEnd(value); }} />
            </label>
            <label className="period-custom-field">
              <span>Bis</span>
              <input type="date" value={customEnd} min={customStart || undefined}
                onChange={(event) => { const value = event.target.value; if (!value) return; setCustomEnd(value); if (customStart && value < customStart) setCustomStart(value); }} />
            </label>
          </div>
        ) : (
          <div className="period-controls">
            <button type="button" className="period-arrow" aria-label="Vorheriger Zeitraum" disabled={!anchor} onClick={() => setAnchor(shiftPeriod(period, anchor, -1))}>←</button>
            <input type="date" aria-label="Datum im Zeitraum" value={anchor} onChange={(event) => { if (event.target.value) setAnchor(event.target.value); }} />
            <button type="button" className="period-arrow" aria-label="Nächster Zeitraum" disabled={!anchor} onClick={() => setAnchor(shiftPeriod(period, anchor, 1))}>→</button>
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="error-message">
          Daten konnten nicht geladen werden. <button onClick={load}>Erneut versuchen</button>
        </p>
      ) : (
        <>
          <section aria-label="Besuche im Zeitraum" className="statistics-totals">
            <StatisticGraphic className="counter-blue" title="U15" subtitle={currentDisplayTitle} disabled={!loaded}>
              <span>U15</span>
              <strong>{loaded ? number.format(stats.counts.u15) : "–"}</strong>
              <small>{loaded && stats.total ? `${percent.format(share(stats.counts.u15, stats.total))} der Besuche` : "\u00a0"}</small>
            </StatisticGraphic>
            <StatisticGraphic className="counter-yellow" title="Ü15" subtitle={currentDisplayTitle} disabled={!loaded}>
              <span>Ü15</span>
              <strong>{loaded ? number.format(stats.counts.o15) : "–"}</strong>
              <small>{loaded && stats.total ? `${percent.format(share(stats.counts.o15, stats.total))} der Besuche` : "\u00a0"}</small>
            </StatisticGraphic>
            <StatisticGraphic className="statistics-total" title="Gesamt" subtitle={currentDisplayTitle} disabled={!loaded}>
              <span>Gesamt</span>
              <strong>{loaded ? number.format(stats.total) : "–"}</strong>
              <small className="total-change" data-tone={change_ === null ? "none" : change_ > 0.02 ? "up" : change_ < -0.02 ? "down" : "flat"}
                title={`Verglichen mit ${shortDate(previous.start)}${previous.end !== previous.start ? ` – ${shortDate(previous.end)}` : ""}`}>
                {!loaded ? "\u00a0" : change_ === null ? `${previous.label}: keine Besuche` : `${change.format(change_)} gegenüber ${previous.label}`}
              </small>
            </StatisticGraphic>
          </section>

          {loaded && (stats.recordedDays > 0 || stats.undated.total > 0) && (
            <p className="statistics-summary">
              {period !== "day" && <span>{stats.recordedDays} {stats.recordedDays === 1 ? "Öffnungstag" : "Öffnungstage"} · Ø {number.format(stats.average)} Besuche pro Tag</span>}
              {stats.undated.total > 0 && <span>{stats.undated.total} nachgetragen, ohne Uhrzeit</span>}
            </p>
          )}
          {loaded && period !== "day" && stats.recordedDays > 0 && stats.recordedDays < 7 && <p className="analytics-note">Erste Tendenz: weniger als sieben Öffnungstage.</p>}

          {loaded && stats.total > 0 && (
            <>
              {period !== "day" && (
                <section className={`highlight-grid ${bestMonth ? "has-three" : ""}`} aria-label="Höhepunkte im Zeitraum">
                  <Highlight label="Bestes Event"
                    value={bestEvent ? bestEvent.events.map((e) => e.title).join(" + ") : "Kein Event"}
                    detail={bestEvent
                      ? `${longDay(bestEvent.date)} · ${number.format(bestEvent.total)} Besuche${bestEvent.uplift !== null ? ` · ${change.format(bestEvent.uplift)} gegenüber einem normalen ${weekdayName(bestEvent.date)}` : ""}`
                      : events.length ? "An den Event-Tagen wurden keine Besuche gezählt." : "In diesem Zeitraum ist kein Event eingetragen."} />
                  <Highlight label="Bester Tag"
                    value={bestDay ? longDay(bestDay.key) : "–"}
                    detail={bestDay ? `${number.format(bestDay.total)} Besuche · U15 ${number.format(bestDay.u15)}, Ü15 ${number.format(bestDay.o15)}${bestDayEvents.length ? ` · Event: ${bestDayEvents.map((e) => e.title).join(" + ")}` : ""}` : ""} />
                  {bestMonth && (
                    <Highlight label="Bester Monat"
                      value={monthName(bestMonth.key)}
                      detail={`${number.format(bestMonth.total)} Besuche · Ø ${number.format(bestMonthDays ? bestMonth.total / bestMonthDays : 0)} pro Öffnungstag`} />
                  )}
                </section>
              )}

              {period !== "day" && (
                <StatisticGraphic as="section" className="analytics-panel statistics-panel" title={`Besuche pro ${unitCaption}`} subtitle={currentDisplayTitle}>
                  <div className="analytics-panel-heading">
                    <div>
                      <h3>Besuche pro {unitCaption}</h3>
                      <p>Säulen: alle Besuche. Linien: U15 und Ü15. Antippen zeigt die Werte.</p>
                    </div>
                  </div>
                  <ComboChart label={`Besuche pro ${unitCaption}, ${currentDisplayTitle}`} points={chartPoints} />
                </StatisticGraphic>
              )}

              {period !== "day" && (
                <FoldedSection title="Wochentage" description="An welchem Tag kommt welches Alter?">
                  <StatisticGraphic as="section" className="age-section" title="Besuche nach Wochentag" subtitle={currentDisplayTitle}>
                    <div className="analytics-panel-heading">
                      <p>
                        {dayU15 && <>U15 kommen am häufigsten {dayU15.label.toLowerCase()}s. </>}
                        {dayO15 && <>Ü15 kommen am häufigsten {dayO15.label.toLowerCase()}s.</>}
                      </p>
                      <SegmentedControl className="age-mode-switch" label="Darstellung" value={ageMode} onValueChange={(value) => setAgeMode(value as "count" | "share")}
                        options={[{ value: "count", label: "Anzahl" }, { value: "share", label: "Anteil" }]} />
                    </div>
                    <h4 className="chart-title">{ageMode === "count" ? "Ø Besuche pro Öffnungstag" : "Anteil U15"}</h4>
                    <Bars mode={ageMode} label="Besuche nach Wochentag" rows={weekdayRows} />
                    <Legend />
                  </StatisticGraphic>
                </FoldedSection>
              )}
            </>
          )}

          <FoldedSection title="Event-Auswertung" description="Bringen Events mehr Besucher als ein normaler Tag?">
            <EventAnalytics onSelectDay={(d) => { setPeriod("day"); setAnchor(d); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
          </FoldedSection>
        </>
      )}

    </main>
  );
}
