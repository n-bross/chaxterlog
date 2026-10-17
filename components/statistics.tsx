"use client";

import Link from "next/link";
import ChaxterLogo from "@/components/chaxter-logo";
import CorrectionLog from "@/components/correction-log";
import { correctionEntries } from "@/lib/corrections";
import { readRecords } from "@/lib/sync-state";
import VisitTable from "@/components/visit-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dayKey, readEvents, STORAGE_PREFIX, type TrackEvent } from "@/lib/tracking";
import { analyzeEvents, periodRange, shiftPeriod, type Period } from "@/lib/statistics";

import { useVisitSync } from "@/lib/use-visit-sync";
import SyncStatus from "@/components/sync-status";

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Tag" }, { value: "week", label: "Woche" },
  { value: "month", label: "Monat" }, { value: "year", label: "Jahr" }, { value: "all", label: "Gesamt" },
];
const number = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
const shortDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });
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
  return <div className="analytics-bars" role="list" aria-label={label}>
    {rows.map((row) => <div key={row.key} className="analytics-bar-row" role="listitem" aria-label={`${row.label}: ${number.format(row.value)}${row.detail ? `, ${row.detail}` : ""}`}>
      <span className="analytics-bar-label">{row.label}</span>
      <span className="analytics-bar-track" aria-hidden="true"><span className="analytics-bar-fill" style={{ width: `${row.value / max * 100}%` }}>
        {stacked ? <><span className="counter-blue" style={{ flex: row.u15 ?? 0 }} /><span className="counter-yellow" style={{ flex: row.o15 ?? 0 }} /></> : <span className="counter-blue" style={{ flex: 1 }} />}
      </span></span>
      <span className="analytics-bar-value">{number.format(row.value)}</span>
    </div>)}
  </div>;
}

export default function Statistics() {
  const [anchor, setAnchor] = useState("");
  const [period, setPeriod] = useState<Period>("day");
  const [records, setRecords] = useState<TrackEvent[]>([]);
  const [events, setEvents] = useState<TrackEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(0);
  const load = useCallback(() => {
    try { setEvents(readEvents(localStorage)); setRecords(readRecords(localStorage)); setError(false); }
    catch { setError(true); }
    setLoaded(true);
  }, []);

  const syncStatus = useVisitSync(load);

  useEffect(() => {
    setAnchor(dayKey());
    load();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) load();
    };
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
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
  const corrections = useMemo(() => {
    const range = periodRange(period, anchor || "2000-01-01");
    return correctionEntries(records).filter((item) => { const day = dayKey(new Date(item.timestamp)); return !range || day >= range.start && day <= range.end; });
  }, [records, period, anchor]);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(stats.total / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleEvents = stats.events.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const bestWeekday = stats.bestWeekdays[0];
  const bestHour = stats.bestHours[0];
  const bestDay = stats.bestDays[0];
  const unitLabel = { hour: "Stunden", day: "Tage", month: "Monate", year: "Jahre" }[stats.unit];
  const unitCaption = { hour: "Stunde", day: "Tag", month: "Monat", year: "Jahr" }[stats.unit];

  return <main className="statistics-screen">
    <div className="statistics-brand"><ChaxterLogo /><SyncStatus status={syncStatus} /></div>
    <header className="flex items-center justify-between gap-4">
      <Link href="/" className="stats-button">← Zählen</Link>
      <h1 className="text-xl font-semibold tracking-tight">Statistik</h1>
    </header>
    <div className="period-switch" role="group" aria-label="Zeitraum">
      {PERIODS.map(({ value, label }) => <button key={value} type="button" aria-pressed={period === value} onClick={() => { setPeriod(value); setPage(0); }}>{label}</button>)}
    </div>
    <div className="period-navigation">
      <h2 aria-live="polite">{rangeTitle(period, anchor)}</h2>
      {period !== "all" && <div className="period-controls">
        <button type="button" className="period-arrow" aria-label="Vorheriger Zeitraum" disabled={!anchor} onClick={() => { setAnchor(shiftPeriod(period, anchor, -1)); setPage(0); }}>←</button>
        <input type="date" aria-label="Datum im Zeitraum" value={anchor} onChange={(event) => { if (event.target.value) { setAnchor(event.target.value); setPage(0); } }} className="date-input" />
        <button type="button" className="period-arrow" aria-label="Nächster Zeitraum" disabled={!anchor} onClick={() => { setAnchor(shiftPeriod(period, anchor, 1)); setPage(0); }}>→</button>
      </div>}
    </div>
    {error ? <p role="alert" className="error-message">Browserspeicher nicht verfügbar. <button className="underline" onClick={load}>Erneut versuchen</button></p> : <>
      <section aria-label="Besuche im Zeitraum" className="statistics-totals">
        <div className="counter-blue"><span>U15</span><strong>{loaded ? number.format(stats.counts.u15) : "–"}</strong></div>
        <div className="counter-yellow"><span>Ü15</span><strong>{loaded ? number.format(stats.counts.o15) : "–"}</strong></div>
        <div className="statistics-total"><span>Gesamt</span><strong>{loaded ? number.format(stats.total) : "–"}</strong></div>
      </section>
      <p className="analytics-basis">{loaded ? `${stats.recordedDays} erfasste Tage · Ø ${number.format(stats.average)} Besuche pro erfasstem Tag` : "Daten werden geladen …"}</p>
      {loaded && stats.total === 0 ? <section className="analytics-empty"><h2>Noch keine Besuche</h2><p>Für diesen Zeitraum sind keine Besuche gespeichert.</p></section> : loaded && <>
        <section className="insight-grid" aria-label="Auswertung des Zeitraums">
          <article className="analytics-panel insight-card"><h3>Stärkster Wochentag</h3><strong>{stats.bestWeekdays.length > 1 ? "Gleichstand" : bestWeekday?.label ?? "–"}</strong><p>{stats.bestWeekdays.length > 1 ? `${stats.bestWeekdays.map((day) => day.label).join(", ")} · ` : ""}Ø {number.format(bestWeekday?.average ?? 0)} Besuche je erfasstem Wochentag</p></article>
          <article className="analytics-panel insight-card"><h3>Stärkstes Stundenfenster</h3><strong>{stats.bestHours.length === 1 ? bestHour.label : "Gleichstand"}</strong><p>{stats.bestHours.length > 1 ? `${stats.bestHours.length} Stundenfenster mit je ${number.format(bestHour?.total ?? 0)} Besuchen` : `${number.format(bestHour?.total ?? 0)} Besuche im Zeitraum`}</p></article>
          <article className="analytics-panel insight-card"><h3>Stärkster einzelner Tag</h3><strong>{stats.bestDays.length === 1 ? shortDate(bestDay.key) : "Gleichstand"}</strong><p>{stats.bestDays.length > 1 ? `${stats.bestDays.length} Tage mit je ${number.format(bestDay?.total ?? 0)} Besuchen` : `${number.format(bestDay?.total ?? 0)} Besuche im Zeitraum`}</p></article>
        </section>
        <section className="analytics-panel trend-panel" aria-label="Besuchsverlauf">
          <div className="analytics-panel-heading"><div><h3>Verlauf</h3><p>Besuche pro {unitCaption}</p></div><div className="chart-legend"><span><i className="counter-blue" />U15</span><span><i className="counter-yellow" />Ü15</span></div></div>
          <Bars stacked label={`Besuche nach ${unitLabel}`} rows={stats.series.map((item) => ({ ...item, value: item.total, detail: `U15 ${item.u15}, Ü15 ${item.o15}` }))} />
        </section>
        <div className="analytics-chart-grid">
          <section className="analytics-panel"><div className="analytics-panel-heading"><div><h3>Wochentage</h3><p>Ø Besuche pro erfasstem Wochentag</p></div></div><Bars label="Durchschnitt nach Wochentag" rows={stats.weekdays.map((item) => ({ ...item, value: item.average, detail: `${item.days} erfasste Tage, ${item.total} Besuche` }))} /></section>
          <section className="analytics-panel"><div className="analytics-panel-heading"><div><h3>Uhrzeiten</h3><p>Besuche je Stunde · Europe/Berlin</p></div></div><Bars label="Besuche nach Stundenfenster" rows={stats.hours.map((item) => ({ ...item, value: item.total }))} /></section>
        </div>
        <p className="analytics-note">{stats.recordedDays < 7 ? "Erste Tendenz: weniger als 7 erfasste Tage. " : ""}Alle Auswertungen gelten für den gewählten Zeitraum. Nur Tage mit mindestens einem Besuch zählen als erfasst. Tage ohne Einträge sind nicht als Öffnungstage bekannt. Stundenwerte sind Summen, Wochentagswerte Durchschnittswerte. Gleichstände werden gleich bewertet.</p>
      </>}
      <section className="analytics-panel events-panel" aria-label="Einzelne Besuche">
        <div className="analytics-panel-heading"><div><h3>Einzelne Besuche</h3><p>Neueste zuerst · Uhrzeit in Grafing</p></div><span className="analytics-basis">{number.format(stats.total)}</span></div>
        <VisitTable events={visibleEvents} />
        {pageCount > 1 && <nav className="events-pagination" aria-label="Besuchsseiten"><button className="period-arrow" aria-label="Vorherige Besuchsseite" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>←</button><span>{currentPage + 1} / {pageCount}</span><button className="period-arrow" aria-label="Nächste Besuchsseite" disabled={currentPage + 1 === pageCount} onClick={() => setPage(currentPage + 1)}>→</button></nav>}
      </section>
      <CorrectionLog entries={corrections} />
      <p className="analytics-note">Gemeinsame Daten mit lokalem Zwischenspeicher. Besuche werden gezählt, keine eindeutigen Personen. Rückgängig gemachte Klicks sind ausgeschlossen.</p>
    </>}
  </main>;
}
