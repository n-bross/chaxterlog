"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { dayKey, readDay, undoLastClick, STORAGE_PREFIX, type AgeGroup, type Counts, type TrackEvent } from "@/lib/tracking";

import { latestRedo, redoLastClick } from "@/lib/corrections";
import type { Correction } from "@/lib/correction-types";
import { queueVisit } from "@/lib/sync-state";
import { LOCAL_CHANGE } from "@/lib/sync";
import { useVisitSync } from "@/lib/use-visit-sync";
import { createId, getDevice } from "@/lib/device";
import SyncStatus from "@/components/sync-status";

type IconName = "undo" | "redo" | "stats";
function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    undo: <path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12" />,
    redo: <path d="m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12" />,
    stats: <path d="M5 20V10m7 10V4m7 16v-7" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>;
}

export default function Counter({ user }: { user: { id: string; username: string; role: string } }) {
  const [counts, setCounts] = useState<Counts>({ u15: 0, o15: 0 });
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState("");
  const selectedDayRef = useRef<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<AgeGroup, boolean>>({ u15: false, o15: false });
  const [redoEvent, setRedoEvent] = useState<TrackEvent | null>(null);
  const [lastEvent, setLastEvent] = useState<TrackEvent | null>(null);
  const [feedback, setFeedback] = useState("");
  const timers = useRef<Partial<Record<AgeGroup, ReturnType<typeof setTimeout>>>>({});

  const refresh = useCallback(() => {
    const date = new Date();
    const day = selectedDayRef.current ?? dayKey(date);
    try {
      const { counts, latest } = readDay(localStorage, day);
      setCounts(counts);
      setLastEvent(latest?.event ?? null);
      setRedoEvent(latestRedo(localStorage, day));
      setStorageError(null);
      setReady(true);
    } catch {
      setStorageError("Browserspeicher nicht verfügbar.");
      setReady(false);
    }
    setSelectedDay(day);
    setNow(date);
  }, []);

  const syncStatus = useVisitSync(refresh);

  useEffect(() => {
    // The compact interface follows the device's appearance without another button.
    delete document.documentElement.dataset.theme;
    refresh();
    const interval = setInterval(refresh, 15_000);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) refresh();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      Object.values(timers.current).forEach(clearTimeout);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  function track(group: AgeGroup) {
    const date = new Date();
    const device = getDevice();
    const event: TrackEvent = {
      id: createId(), group, timestamp: date.toISOString(),
      deviceId: device.id, deviceName: device.name, platform: device.platform, userId: user.id, username: user.username, legacy: false,
      order: performance.timeOrigin + performance.now(),
    };
    try {
      queueVisit(localStorage, event);
    } catch {
      setStorageError("Nicht gespeichert. Bitte Browserspeicher freigeben.");
      return;
    }
    selectedDayRef.current = null;
    refresh();
    setFeedback(`${group === "u15" ? "U15" : "Ü15"}: Besuch gespeichert. ${readDay(localStorage).counts[group]} heute.`);
    clearTimeout(timers.current[group]);
    setFlash((value) => ({ ...value, [group]: true }));
    timers.current[group] = setTimeout(() => setFlash((value) => ({ ...value, [group]: false })), 150);
    window.dispatchEvent(new Event(LOCAL_CHANGE));
  }

  function correction(kind: "undo" | "redo"): Correction {
    const device = getDevice();
    return { id: createId(), kind, timestamp: new Date().toISOString(), order: performance.timeOrigin + performance.now(), userId: user.id, username: user.username, deviceId: device.id, deviceName: device.name, platform: device.platform };
  }

  function undo() {
    if (selectedDayRef.current && selectedDayRef.current !== dayKey()) return;
    let event: TrackEvent | null;
    try { event = undoLastClick(localStorage, dayKey(), correction("undo")); }
    catch {
      setStorageError("Rückgängig nicht möglich. Zählung unverändert.");
      return;
    }
    refresh();
    if (!event) return;
    setFeedback(`${event.group === "u15" ? "U15" : "Ü15"}: Besuch rückgängig gemacht. ${event.id}`);
    window.dispatchEvent(new Event(LOCAL_CHANGE));
  }

  function redo() {
    if (selectedDayRef.current && selectedDayRef.current !== dayKey()) return;
    try {
      const restored = redoLastClick(localStorage, correction("redo"));
      if (!restored) return;
      refresh();
      setFeedback(`${restored.group === "u15" ? "U15" : "Ü15"}: Besuch wiederhergestellt.`);
      window.dispatchEvent(new Event(LOCAL_CHANGE));
    } catch { setStorageError("Wiederherstellen nicht möglich. Zählung unverändert."); }
  }

  return (
    <main className="count-screen">
      <header className="count-header">
        <nav className="count-header-actions" aria-label="Konto und Statistik">
          <Link href="/konto" className="account-button" aria-label="Konto und Gerät" title={user.username}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg></Link>
          <Link href="/statistik" className="stats-button" aria-label="Statistik"><Icon name="stats" className="size-5" /><span className="stats-label">Statistik</span></Link>
        </nav>
        <output className="day-total" aria-label={`Gesamtzahl am ${selectedDay}: ${counts.u15 + counts.o15}`} aria-live="polite">{ready ? counts.u15 + counts.o15 : "–"}</output>
        <div className="count-header-date">
        <label className="date-control">
          <time dateTime={selectedDay || undefined}>{selectedDay ? new Date(`${selectedDay}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) : "\u00a0"}</time>
          <input type="date" className="count-date" aria-label="Tag auswählen" onClick={(event) => { try { event.currentTarget.showPicker?.(); } catch { /* Native date input remains available. */ } }} value={selectedDay} max={now ? dayKey(now) : undefined} onChange={(event) => {
          const value = event.target.value;
          selectedDayRef.current = value && value !== dayKey() ? value : null;
          refresh();
        }} />
        </label>
        <SyncStatus status={syncStatus} />
        </div>
      </header>
      <div className="count-grid">
        {([ ["u15", "U15", "counter-blue"], ["o15", "Ü15", "counter-yellow"] ] as const).map(([group, label, color]) => (
          <button key={group} type="button" disabled={!ready} onClick={() => track(group)} aria-label={`${label}: einen Besuch für heute zählen. Stand am ${selectedDay}: ${counts[group]}`} className={`counter-button ${color}`} data-flash={flash[group]}>
            <span className="counter-title">{label}</span>
            <span className="counter-bottom"><span className="counter-count">{ready ? counts[group] : "–"}</span></span>
          </button>
        ))}
      </div>
      <div className="count-actions" aria-label="Korrekturen">
        <button type="button" onClick={undo} disabled={!ready || !lastEvent || selectedDay !== (now ? dayKey(now) : "")} className="undo-button"><Icon name="undo" className="size-8" />Undo</button>
        <button type="button" onClick={redo} disabled={!ready || !redoEvent || selectedDay !== (now ? dayKey(now) : "")} className="undo-button redo-button"><Icon name="redo" className="size-8" />Redo</button>
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{feedback}</div>
      {syncStatus.state === "conflict" && <div role="alert" className="error-message">{syncStatus.message} <Link className="underline" href="/login">Anmelden</Link></div>}
      {storageError && <div role="alert" className="error-message">{storageError} <button className="underline" onClick={refresh}>Erneut prüfen</button></div>}
    </main>
  );
}
