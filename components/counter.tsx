"use client";
import DuplicateWarning from "./duplicate-warning";
import { Modal } from "./interior/modal";
import { FloatingLabelInput } from "./interior/floating-label";
import { LoadingButton } from "./interior/loading-button";

import Link from "next/link";
import Image from "next/image";
import chaxterLogo from "@/public/chaxter-logo.png";
import { useCallback, useEffect, useRef, useState } from "react";
import { dayKey, readDay, readEvents, undoLastClick, STORAGE_PREFIX, type AgeGroup, type Counts, type TrackEvent } from "@/lib/tracking";

import { latestRedo, redoLastClick } from "@/lib/corrections";
import type { Correction } from "@/lib/correction-types";
import { queueVisit } from "@/lib/sync-state";
import { LOCAL_CHANGE } from "@/lib/sync";
import { useVisitSync } from "@/lib/use-visit-sync";
import { createId, getDevice } from "@/lib/device";
import SyncStatus from "@/components/sync-status";
import type { ChaxterEvent } from "@/lib/events";

type IconName = "undo" | "redo" | "stats" | "calendar" | "user";
function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    undo: <path d="M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12" />,
    redo: <path d="m15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 11h18" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
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
  const [latestByGroup, setLatestByGroup] = useState<Record<AgeGroup, TrackEvent | null>>({ u15: null, o15: null });
  const [feedback, setFeedback] = useState("");
  const timers = useRef<Partial<Record<AgeGroup, ReturnType<typeof setTimeout>>>>({});
  const holdTimers = useRef<Record<AgeGroup, ReturnType<typeof setTimeout> | null>>({ u15: null, o15: null });
  const isLongPressRef = useRef<Record<AgeGroup, boolean>>({ u15: false, o15: false });
  const pointerStartPosRef = useRef<Record<AgeGroup, { x: number; y: number } | null>>({ u15: null, o15: null });

  // Event & Duplicate tracking states
  const [currentDayEvent, setCurrentDayEvent] = useState<ChaxterEvent | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{
    group: AgeGroup;
    diffSeconds: number;
    user1: string;
    user2: string;
  } | null>(null);
  const [dismissedDuplicate, setDismissedDuplicate] = useState(false);

  // Quick event input modal state
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [eventSaveError, setEventSaveError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const date = new Date();
    const day = selectedDayRef.current ?? dayKey(date);
    try {
      const { counts, latest } = readDay(localStorage, day);
      setCounts(counts);
      setLastEvent(latest?.event ?? null);
      setRedoEvent(latestRedo(localStorage, day));

      // Inspect recent visits on this day to detect rapid duplicates and latest per group
      const allEvents = readEvents(localStorage);
      const activeDayEvents = allEvents
        .filter((e) => dayKey(new Date(e.timestamp)) === day && !(e as TrackEvent & { cancelled?: boolean }).cancelled)
        .sort((a, b) => (b.order ?? Date.parse(b.timestamp)) - (a.order ?? Date.parse(a.timestamp)));

      const latestU15 = activeDayEvents.find((e) => e.group === "u15") ?? null;
      const latestO15 = activeDayEvents.find((e) => e.group === "o15") ?? null;
      setLatestByGroup({ u15: latestU15, o15: latestO15 });

      const e1 = activeDayEvents[0] ?? null;
      const e2 = activeDayEvents[1] ?? null;

      if (e1 && e2 && e1.group === e2.group) {
        const order1 = e1.order ?? Date.parse(e1.timestamp);
        const order2 = e2.order ?? Date.parse(e2.timestamp);
        const diffMs = Math.abs(order1 - order2);
        const isRecent = Date.now() - Date.parse(e1.timestamp) < 45_000;
        if (diffMs <= 4000 && isRecent) {
          setDuplicateWarning({
            group: e1.group,
            diffSeconds: Math.max(1, Math.round(diffMs / 1000)),
            user1: e1.username || "Mitarbeiter",
            user2: e2.username || "Mitarbeiter",
          });
        } else {
          setDuplicateWarning(null);
        }
      } else {
        setDuplicateWarning(null);
      }

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

  // Load event for current day
  const loadDayEvent = useCallback((day: string) => {
    if (!day) return;
    fetch(`/api/events?from=${day}&to=${day}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !Array.isArray(data.events)) return;
        const matching = data.events.find((ev: ChaxterEvent) => ev.date === day);
        setCurrentDayEvent(matching || null);
      })
      .catch(() => setCurrentDayEvent(null));
  }, []);

  useEffect(() => {
    loadDayEvent(selectedDay);
  }, [selectedDay, loadDayEvent]);

  async function handleSaveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!eventDate || !eventTitle.trim()) return;
    setIsSavingEvent(true);
    setEventSaveError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: eventDate,
          title: eventTitle.trim(),
          description: eventDesc.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler beim Speichern");
      setShowEventModal(false);
      setEventTitle("");
      setEventDesc("");
      loadDayEvent(selectedDay);
    } catch (err: unknown) {
      setEventSaveError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setIsSavingEvent(false);
    }
  }

  useEffect(() => {
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
    setDismissedDuplicate(false);
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

  const formatRelativeTime = (timestamp: string) => {
    const sec = Math.max(0, Math.floor((Date.now() - Date.parse(timestamp)) / 1000));
    if (sec < 5) return "gerade eben";
    if (sec < 60) return `vor ${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `vor ${min}m`;
    return new Date(timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <main className="count-screen">
      <header className="count-header">
        {/* Account and statistics */}
        <div className="count-header-left">
          <Link href="/konto" className="header-account-link" aria-label="Konto und Einstellungen" title={`Konto: ${user.username}`}>
            <Icon name="user" />
          </Link>
          <Link href="/statistik" className="stats-button header-stats-btn" aria-label="Statistik" title="Statistik öffnen">
            <Icon name="stats" className="size-4 stats-icon" />
            <span className="stats-label">Statistik</span>
          </Link>
        </div>

        {/* Center: Total count */}
        <div className="count-header-center">
          <div className="day-total-wrap">
            <output className="day-total" aria-label={`Gesamtzahl am ${selectedDay}: ${counts.u15 + counts.o15}`} aria-live="polite">
              {ready ? counts.u15 + counts.o15 : "–"}
            </output>
            <span className="day-total-sublabel">Gesamt</span>
          </div>
        </div>

        {/* Right: Event (+ Button) & Date without button styling */}
        <div className="count-header-right">
          <button
            type="button"
            onClick={() => {
              setEventDate(selectedDay || dayKey());
              setEventTitle(currentDayEvent ? currentDayEvent.title : "");
              setEventDesc(currentDayEvent?.description || "");
              setEventSaveError(null);
              setShowEventModal(true);
            }}
            className={`header-event-trigger ${currentDayEvent ? "has-event" : ""}`}
            aria-label="Event eintragen oder ansehen"
            title={currentDayEvent ? `Event: ${currentDayEvent.title}` : "Event für diesen Tag eintragen"}
          >
            <Icon name="calendar" className="event-calendar-icon" />
            <span className="event-trigger-label">Event</span>
          </button>

          <div className="count-header-date">
            <label className="clean-date-control" title="Tag auswählen">
              <time dateTime={selectedDay || undefined} className="date-display-full">
                {selectedDay ? new Date(`${selectedDay}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) : "\u00a0"}
              </time>
              <time dateTime={selectedDay || undefined} className="date-display-short">
                {selectedDay ? new Date(`${selectedDay}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" }) : "\u00a0"}
              </time>
              <input
                type="date"
                className="count-date"
                aria-label="Tag auswählen"
                onClick={(event) => { try { event.currentTarget.showPicker?.(); } catch { /* Native date input */ } }}
                value={selectedDay}
                max={now ? dayKey(now) : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  selectedDayRef.current = value && value !== dayKey() ? value : null;
                  refresh();
                }}
              />
            </label>
            <SyncStatus status={syncStatus} />
          </div>
        </div>
      </header>

      {duplicateWarning && !dismissedDuplicate && (
        <DuplicateWarning warning={duplicateWarning}
          onUndo={() => { undoGroup(duplicateWarning.group); setDismissedDuplicate(true); }}
          onDismiss={() => setDismissedDuplicate(true)} />
      )}

      {/* Big Counting Buttons with Latest Editor directly on the respective button */}
      <div className="count-grid">
        <div className="count-brand-backdrop" aria-hidden="true">
          <Image src={chaxterLogo} alt="" fill sizes="100vw" loading="eager" className="count-brand-image" />
        </div>
        {([ ["u15", "U15", "counter-blue"], ["o15", "Ü15", "counter-yellow"] ] as const).map(([group, label, color]) => {
          const groupLatest = latestByGroup[group];
          return (
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

              <div className="counter-top-section">
                <span className="counter-title">{label}</span>
                {groupLatest && (
                  <span
                    className="counter-last-user"
                    title={`Zuletzt: ${groupLatest.username || "Mitarbeiter"} um ${new Date(groupLatest.timestamp).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}
                  >
                    Zuletzt: <strong>{groupLatest.username || "Mitarbeiter"}</strong> <span className="counter-last-time">({formatRelativeTime(groupLatest.timestamp)})</span>
                  </span>
                )}
              </div>

              <span className="counter-count">{ready ? counts[group] : "–"}</span>

              <span className="counter-bottom-section">
                <span className="counter-hold-hint" aria-hidden="true">
                  {holdingGroup === group ? "−1 abziehen …" : "Halten: −1"}
                </span>
              </span>
            </button>
          );
        })}
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
    
      {/* Quick Event Input Modal */}
      <Modal open={showEventModal} onClose={() => { if (!isSavingEvent) setShowEventModal(false); }} title="Event eintragen" maxWidth={480} className="interior-modal" showClose={!isSavingEvent}>
            <form onSubmit={handleSaveEvent} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Tag auswählen:</label>
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <FloatingLabelInput label="Event-Name"
                  required
                  value={eventTitle}
                  onChange={(value) => setEventTitle(value)}
                 />
              <FloatingLabelInput label="Notiz / Uhrzeit (optional)"
                  value={eventDesc}
                  onChange={(value) => setEventDesc(value)}
                 />

              {eventSaveError && <p className="error-message text-xs">{eventSaveError}</p>}

              <div className="modal-actions flex items-center justify-between pt-2">
                <Link
                  href="/statistik#events"
                  className="text-xs text-muted underline hover:text-white"
                  onClick={() => setShowEventModal(false)}
                >
                  Alle Events &amp; Import →
                </Link>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="secondary-button btn-small"
                    onClick={() => setShowEventModal(false)}
                    disabled={isSavingEvent}
                  >
                    Abbrechen
                  </button>
                  <LoadingButton type="submit" className="primary-button btn-small" disabled={isSavingEvent || !eventTitle.trim()} busy={isSavingEvent} busyLabel="Speichern …">{"Speichern"}</LoadingButton>
                </div>
              </div>
            </form>
      </Modal>
    </main>
  );
}
