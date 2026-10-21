"use client";
import { errorMessage } from "@/lib/errors";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { convex } from "@/lib/convex-client";
import { applySnapshot, displayCounts } from "@/lib/sync";
import DuplicateWarning from "./duplicate-warning";
import { Modal } from "./interior/modal";
import { FloatingLabelInput } from "./interior/floating-label";
import { LoadingButton } from "./interior/loading-button";

import Link from "next/link";
import Image from "next/image";
import chaxterLogo from "@/public/chaxter-logo.png";
import { useCallback, useEffect, useRef, useState } from "react";
import { atBerlinTime, dayKey, readDay, readEvents, undoLastClick, STORAGE_PREFIX, type AgeGroup, type Counts, type TrackEvent } from "@/lib/tracking";

import { latestRedo, redoLastClick } from "@/lib/corrections";
import type { Correction } from "@/lib/correction-types";
import { queueVisit } from "@/lib/sync-state";
import { LOCAL_CHANGE } from "@/lib/sync";
import { useVisitSync } from "@/lib/use-visit-sync";
import { createId, getDevice } from "@/lib/device";
import SyncStatus from "@/components/sync-status";
import type { ChaxterEvent } from "@/lib/events";

const BACKFILL_IDLE_MS = 5 * 60_000;

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
  const [dayEvents, setDayEvents] = useState<ChaxterEvent[]>([]);
  const currentDayEvent = dayEvents[0] ?? null;
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
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [isSavingEvent, setIsSavingEvent] = useState(false);
  const [eventSaveError, setEventSaveError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const date = new Date();
    const day = selectedDayRef.current ?? dayKey(date);
    try {
      const { latest } = readDay(localStorage, day);
      const counts = displayCounts(localStorage, day);
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
  const { isAuthenticated } = useConvexAuth();
  const live = useQuery(api.visits.live, isAuthenticated && selectedDay ? { date: selectedDay } : "skip");
  useEffect(() => { if (live) { try { applySnapshot(localStorage, live); refresh(); } catch { setStorageError("Browserspeicher nicht verfügbar."); } } }, [live, refresh]);

  // Load event for current day
  const loadDayEvent = useCallback((day: string) => {
    if (!day) return;
    convex.query(api.events.list, { from: day, to: day, paginationOpts: { cursor: null, numItems: 100 } })
      .then((data) => setDayEvents(data.page))
      .catch(() => setDayEvents([]));
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
      await convex.mutation(api.events.save, { events: [{ ...(editingEventId ? { id: editingEventId } : {}), date: eventDate, title: eventTitle.trim(), description: eventDesc.trim() || undefined }] });
      setShowEventModal(false);
      setEventTitle("");
      setEventDesc("");
      loadDayEvent(selectedDay);
    } catch (err: unknown) {
      setEventSaveError(errorMessage(err, "Fehler beim Speichern"));
    } finally {
      setIsSavingEvent(false);
    }
  }

  useEffect(() => {
    delete document.documentElement.dataset.theme;
    refresh();

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) refresh();
    };
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {

      Object.values(timers.current).forEach(clearTimeout);
      Object.values(holdTimers.current).forEach((t) => { if (t) clearTimeout(t); });
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });

  // A past day stays selected for entering missed visits; after a pause the view returns to today
  // so the next shift does not count on the wrong day by accident.
  const backfillTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armBackfillTimer = useCallback(() => {
    if (backfillTimer.current) clearTimeout(backfillTimer.current);
    backfillTimer.current = selectedDayRef.current ? setTimeout(() => { selectedDayRef.current = null; refresh(); }, BACKFILL_IDLE_MS) : null;
  }, [refresh]);
  useEffect(() => () => { if (backfillTimer.current) clearTimeout(backfillTimer.current); }, []);
  const activeDay = () => selectedDayRef.current ?? dayKey();

  function track(group: AgeGroup) {
    const backfillDay = selectedDayRef.current && selectedDayRef.current < dayKey() ? selectedDayRef.current : null;
    const date = backfillDay ? atBerlinTime(backfillDay) : new Date();
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
    if (!backfillDay) selectedDayRef.current = null;
    armBackfillTimer();
    setDismissedDuplicate(false);
    refresh();
    const day = backfillDay ?? dayKey();
    setFeedback(`${group === "u15" ? "U15" : "Ü15"}: Besuch ${backfillDay ? `für ${shortDay(backfillDay)} nachgetragen` : "gespeichert"}. ${displayCounts(localStorage, day)[group]} ${backfillDay ? "an diesem Tag" : "heute"}.`);
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
    const day = activeDay();
    armBackfillTimer();
    let event: TrackEvent | null;
    try {
      event = undoLastClick(localStorage, day, correction("undo"), group);
    } catch {
      setStorageError("Rückgängig nicht möglich. Zählung unverändert.");
      return;
    }
    refresh();
    const groupLabel = group === "u15" ? "U15" : "Ü15";
    if (!event) {
      setFeedback(`${groupLabel}: Keine Besuche ${selectedDayRef.current ? "an diesem Tag" : "heute"} zum Abziehen.`);
      try { navigator.vibrate?.([30, 40, 30]); } catch { /* Ignore */ }
      return;
    }
    const currentCounts = displayCounts(localStorage, day);
    setFeedback(`${groupLabel}: 1 abgezogen (Besuch zurückgenommen). Stand: ${currentCounts[group]}.`);
    setDecrementFlash((value) => ({ ...value, [group]: true }));
    setTimeout(() => setDecrementFlash((value) => ({ ...value, [group]: false })), 350);
    try { navigator.vibrate?.(60); } catch { /* Ignore */ }
    window.dispatchEvent(new Event(LOCAL_CHANGE));
  }

  function undo() {
    armBackfillTimer();
    let event: TrackEvent | null;
    try { event = undoLastClick(localStorage, activeDay(), correction("undo")); }
    catch {
      setStorageError("Rückgängig nicht möglich. Zählung unverändert.");
      return;
    }
    refresh();
    if (!event) return;
    setFeedback(`${event.group === "u15" ? "U15" : "Ü15"}: Besuch rückgängig gemacht.`);
    window.dispatchEvent(new Event(LOCAL_CHANGE));
  }

  function redo() {
    armBackfillTimer();
    try {
      const restored = redoLastClick(localStorage, correction("redo"), activeDay());
      if (!restored) return;
      refresh();
      setFeedback(`${restored.group === "u15" ? "U15" : "Ü15"}: Besuch wiederhergestellt.`);
      window.dispatchEvent(new Event(LOCAL_CHANGE));
    } catch { setStorageError("Wiederherstellen nicht möglich. Zählung unverändert."); }
  }

  function handlePointerDown(group: AgeGroup, e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    if (!ready) return;

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
            <output className="day-total" aria-label={ready && selectedDay ? `Gesamtzahl am ${selectedDay}: ${counts.u15 + counts.o15}` : "Gesamtzahl wird geladen"} aria-live="polite">
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
              setEditingEventId(currentDayEvent?.id ?? null);
              setEventTitle(currentDayEvent ? currentDayEvent.title : "");
              setEventDesc(currentDayEvent?.description || "");
              setEventSaveError(null);
              setShowEventModal(true);
            }}
            className={`header-event-trigger ${currentDayEvent ? "has-event" : ""}`}
            aria-label="Event eintragen oder ansehen"
            title={dayEvents.length ? `${dayEvents.length === 1 ? "Event" : "Events"}: ${dayEvents.map((item) => item.title).join(", ")}` : "Event für diesen Tag eintragen"}
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
                  selectedDayRef.current = value && value < dayKey() ? value : null;
                  armBackfillTimer();
                  refresh();
                }}
              />
            </label>
            <SyncStatus status={syncStatus} />
          </div>
        </div>
      </header>

      {ready && selectedDay && now && selectedDay < dayKey(now) && (
        <div className="backfill-notice" role="status">
          <span><strong>Nachtrag für {shortDay(selectedDay)}:</strong> Klicks, Undo und Redo gelten für diesen Tag.</span>
          <button type="button" className="backfill-today" onClick={() => { selectedDayRef.current = null; armBackfillTimer(); refresh(); }}>Zurück zu heute</button>
        </div>
      )}

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
          disabled={!ready || !redoEvent}
          className="undo-button redo-button"
          aria-label="Redo: Zuletzt stornierten Besuch wiederherstellen"
        >
          <Icon name="redo" className="size-6" />
          <span>Redo</span>
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!ready || !lastEvent}
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
      <Modal open={showEventModal} onClose={() => { if (!isSavingEvent) setShowEventModal(false); }} title={editingEventId ? "Event bearbeiten" : "Neues Event eintragen"} maxWidth={480} className="interior-modal" showClose={!isSavingEvent}>
            <form onSubmit={handleSaveEvent} className="space-y-3">
              {dayEvents.length > 0 && (
                <div className="event-choice" role="group" aria-label="Events an diesem Tag">
                  {dayEvents.map((item) => (
                    <button key={item.id} type="button" className="secondary-button btn-small" aria-pressed={editingEventId === item.id}
                      onClick={() => { setEditingEventId(item.id); setEventDate(item.date); setEventTitle(item.title); setEventDesc(item.description || ""); }}>
                      {item.title}
                    </button>
                  ))}
                  <button type="button" className="secondary-button btn-small" aria-pressed={!editingEventId}
                    onClick={() => { setEditingEventId(null); setEventTitle(""); setEventDesc(""); }}>
                    + Weiteres Event
                  </button>
                </div>
              )}
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
