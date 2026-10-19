"use client";
import { useEffect, useState } from "react";
import { convex } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";
import type { VisitRecord } from "@/lib/sync-state";
import type { CorrectionEntry } from "@/lib/corrections";
import ActivityLog from "./activity-log";
import CorrectionLog from "./correction-log";
export default function RemoteActivity({ range }: { range: { start: string; end: string } | null }) {
  const [kind, setKind] = useState<"visits" | "corrections">("visits");
  const [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [corrections, setCorrections] = useState<CorrectionEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const from = range?.start ?? "2000-01-01", to = range?.end ?? "2100-12-31";
  useEffect(() => { setCursor(null); setHistory([]); }, [from, to, kind]);
  useEffect(() => {
    let active = true; setBusy(true); setError("");
    const args = { from, to, paginationOpts: { cursor, numItems: 50 } };
    (kind === "visits" ? convex.query(api.visits.list, args).then((page) => { if (active) { setVisits(page.page); setNext(page.isDone ? null : page.continueCursor); } }) : convex.query(api.corrections.list, args).then((page) => { if (active) { setCorrections(page.page); setNext(page.isDone ? null : page.continueCursor); } }))
      .catch(() => { if (active) setError("Protokoll konnte nicht geladen werden."); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [from, to, kind, cursor]);
  return <>
    <div className="account-btn-group"><button className="secondary-button" onClick={() => setKind("visits")} aria-pressed={kind === "visits"}>Besuche</button><button className="secondary-button" onClick={() => setKind("corrections")} aria-pressed={kind === "corrections"}>Undo &amp; Redo</button></div>
    {error ? <p role="alert">{error}</p> : busy ? <p>Daten werden geladen …</p> : kind === "visits" ? <ActivityLog records={visits} range={range} /> : <CorrectionLog entries={corrections} />}
    <nav className="events-pagination" aria-label="Protokollseiten"><button className="period-arrow" disabled={busy || !history.length} onClick={() => { setCursor(history.at(-1) ?? null); setHistory(history.slice(0, -1)); }}>←</button><span>Seite {history.length + 1} · bis zu 50 Einträge</span><button className="period-arrow" disabled={busy || !next} onClick={() => { setHistory([...history, cursor]); setCursor(next); }}>→</button></nav>
  </>;
}
