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
  const [decrementFlash, setDecrementFlash] = useState<Record<AgeGroup, boolean>>({ u15: false, o15: false });
  const [holdingGroup, setHoldingGroup] = useState<AgeGroup | null>(null);
  const [redoEvent, setRedoEvent] = useState<TrackEvent | null>(null);
  const [lastEvent, setLastEvent] = useState<TrackEvent | null>(null);
  const [feedback, setFeedback] = useState("");
  const timers = useRef<Partial<Record<AgeGroup, ReturnType<typeof setTimeout>>>>({});
  const holdTimers = useRef<Record<AgeGroup, ReturnType<typeof setTimeout> | null>>({ u15: null, o15: null });
  const isLongPressRef = useRef<Record<AgeGroup, boolean>>({ u15: false, o15: false });
  const pointerStartPosRef = useRef<Record<AgeGroup, { x: number; y: number } | null>>({ u15: null, o15: null });

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
      Object.values(holdTimers.current).forEach((t) => { if (t) clearTimeout(t); });
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

  function undoGroup(group: AgeGroup) {
    if (selectedDayRef.current && selectedDayRef.current !== dayKey()) return;
    let event: TrackEvent | null;
    try {
      event = undoLastClick(localStorage, dayKey(), correction("undo"), group);
    } catch {
      setStorageError("Rückgängig nicht möglich. Zählung unverändert.");
      return;
    }
    refresh();
    const groupLabel = group === "u15" ? "U15" : "Ü15";
    if (!event) {
      setFeedback(`${groupLabel}: Keine Besuche heute zum Abziehen.`);
      try { navigator.vibrate?.([30, 40, 30]); } catch { /* Ignore */ }
      return;
    }
    const currentCounts = readDay(localStorage).counts;
    setFeedback(`${groupLabel}: 1 abgezogen (Besuch zurückgenommen). Stand: ${currentCounts[group]}.`);
    setDecrementFlash((value) => ({ ...value, [group]: true }));
    setTimeout(() => setDecrementFlash((value) => ({ ...value, [group]: false })), 350);
    try { navigator.vibrate?.(60); } catch { /* Ignore */ }
    window.dispatchEvent(new Event(LOCAL_CHANGE));
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

  function handlePointerDown(group: AgeGroup, e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    if (!ready) return;
    if (selectedDayRef.current && selectedDayRef.current !== dayKey()) return;

    pointerStartPosRef.current[group] = { x: e.clientX, y: e.clientY };
    isLongPressRef.current[group] = false;
    setHoldingGroup(group);

    if (holdTimers.current[group]) clearTimeout(holdTimers.current[group]!);
    holdTimers.current[group] = setTimeout(() => {
      isLongPressRef.current[group] = true;
      setHoldingGroup(null);
      undoGroup(group);
    }, 500);
  }

  function handlePointerMove(group: AgeGroup, e: React.PointerEvent<HTMLButtonElement>) {
    const start = pointerStartPosRef.current[group];
    if (!start) return;
    if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 12) {
      cancelHold(group);
    }
  }

  function cancelHold(group: AgeGroup) {
    if (holdTimers.current[group]) {
      clearTimeout(holdTimers.current[group]!);
      holdTimers.current[group] = null;
    }
    pointerStartPosRef.current[group] = null;
    setHoldingGroup((current) => (current === group ? null : current));
  }

  function handlePointerUp(group: AgeGroup) {
    if (holdTimers.current[group]) {
      clearTimeout(holdTimers.current[group]!);
      holdTimers.current[group] = null;
    }
    pointerStartPosRef.current[group] = null;
    setHoldingGroup((current) => (current === group ? null : current));
  }

  function handleClick(group: AgeGroup, e: React.MouseEvent<HTMLButtonElement>) {
    if (isLongPressRef.current[group]) {
      isLongPressRef.current[group] = false;
      return;
    }
    if (e.shiftKey || e.altKey) {
      undoGroup(group);
      return;
    }
    track(group);
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
          <button
            key={group}
            type="button"
            disabled={!ready}
            onPointerDown={(e) => handlePointerDown(group, e)}
            onPointerMove={(e) => handlePointerMove(group, e)}
            onPointerUp={() => handlePointerUp(group)}
            onPointerLeave={() => cancelHold(group)}
            onPointerCancel={() => cancelHold(group)}
            onContextMenu={(e) => e.preventDefault()}
            onClick={(e) => handleClick(group, e)}
            aria-label={`${label}: einen Besuch zählen (Tippen für +1, gedrückt halten zum Abziehen für -1). Stand am ${selectedDay}: ${counts[group]}`}
            className={`counter-button ${color}`}
            data-flash={flash[group]}
            data-decrement={decrementFlash[group]}
            data-holding={holdingGroup === group}
          >
            <span className="counter-hold-bar" aria-hidden="true" />
            <span className="counter-minus-badge" aria-hidden="true">−1</span>
            <span className="counter-title">{label}</span>
            <span className="counter-bottom">
              <span className="counter-count">{ready ? counts[group] : "–"}</span>
              <span className="counter-hold-hint" aria-hidden="true">
                {holdingGroup === group ? "−1 abziehen …" : "Halten: −1"}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="count-actions" aria-label="Korrekturen">
        <button
          type="button"
          onClick={redo}
          disabled={!ready || !redoEvent || selectedDay !== (now ? dayKey(now) : "")}
          className="undo-button redo-button"
          aria-label="Redo: Zuletzt stornierten Besuch wiederherstellen"
        >
          <Icon name="redo" className="size-6" />
          <span>Redo</span>
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!ready || !lastEvent || selectedDay !== (now ? dayKey(now) : "")}
          className="undo-button main-undo-button"
          aria-label="Undo: Letzten Besuch rückgängig machen"
        >
          <Icon name="undo" className="size-8" />
          <span>Undo</span>
        </button>
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{feedback}</div>
      {syncStatus.state === "conflict" && <div role="alert" className="error-message">{syncStatus.message} <Link className="underline" href="/login">Anmelden</Link></div>}
      {storageError && <div role="alert" className="error-message">{storageError} <button className="underline" onClick={refresh}>Erneut prüfen</button></div>}
    </main>
  );
}
