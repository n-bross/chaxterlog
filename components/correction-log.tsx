"use client";
import { useState } from "react";
import type { CorrectionEntry } from "@/lib/corrections";
const time = (value: string) => new Date(value).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
export default function CorrectionLog({ entries }: { entries: CorrectionEntry[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(entries.length / 50)), current = Math.min(page, pages - 1);
  return <section className="analytics-panel correction-panel" aria-label="Undo und Redo Protokoll">
    <div className="analytics-panel-heading"><div><h3>Undo &amp; Redo</h3><p>Verwendete Korrekturknöpfe · neueste zuerst</p></div><span className="analytics-basis">{entries.length}</span></div>
    <p className="analytics-note">Aktionen im gewählten Zeitraum. Sie verändern die Zählung des ursprünglichen Besuchstags und bleiben im Protokoll erhalten. Uhrzeiten in Grafing.</p>
    {!entries.length ? <p className="analytics-note">Keine protokollierten Korrekturen in diesem Zeitraum.</p> : <ol className="correction-list">{entries.slice(current * 50, (current + 1) * 50).map((entry) => <li key={entry.id}>
      <div className="correction-heading"><strong className={`correction-kind correction-${entry.kind}`}>{entry.kind === "undo" ? "Undo" : "Redo"}</strong><time dateTime={entry.timestamp}>{time(entry.timestamp)}</time></div>
      <p className="correction-target">{entry.kind === "undo" ? "Zurückgenommen" : "Wiederhergestellt"}: {entry.group === "u15" ? "U15" : "Ü15"} · Besuch {time(entry.visitTimestamp)}</p>
      <dl className="event-attribution"><div><dt>Benutzer</dt><dd>{entry.username || "Nicht erfasst"}</dd></div><div><dt>Gerät des Korrekturknopfs</dt><dd>{entry.deviceName || entry.platform || "Nicht erfasst (ältere Korrektur)"}{entry.deviceId && <small>{entry.platform ? `${entry.platform} · ` : ""}ID {entry.deviceId.slice(0, 8)}</small>}</dd></div></dl>
    </li>)}</ol>}
    {pages > 1 && <nav className="events-pagination" aria-label="Korrekturseiten"><button className="period-arrow" aria-label="Vorherige Korrekturseite" disabled={current === 0} onClick={() => setPage(current - 1)}>←</button><span>{current + 1} / {pages}</span><button className="period-arrow" aria-label="Nächste Korrekturseite" disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>→</button></nav>}
  </section>;
}
