"use client";
import { errorMessage } from "@/lib/errors";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { convex } from "@/lib/convex-client";
import { applySnapshot, displayCounts } from "@/lib/sync";
import { Modal } from "./interior/modal";
import { FloatingLabelInput } from "./interior/floating-label";
import { LoadingButton } from "./interior/loading-button";

import Link from "next/link";
import ChaxterLogo from "./chaxter-logo";
import RollingNumber from "./rolling-number";
import { useCallback, useEffect, useRef, useState } from "react";
import { backfillTime, dayKey, readDay, readEvents, undoLastClick, STORAGE_PREFIX, type AgeGroup, type Counts, type TrackEvent } from "@/lib/tracking";

import { latestRedo, redoLastClick } from "@/lib/corrections";
import type { Correction } from "@/lib/correction-types";
import { queueVisit } from "@/lib/sync-state";
import { LOCAL_CHANGE } from "@/lib/sync";
import { useVisitSync } from "@/lib/use-visit-sync";
import { createId, getDevice } from "@/lib/device";
import SyncStatus from "@/components/sync-status";
import type { ChaxterEvent } from "@/lib/events";

const BACKFILL_IDLE_MS = 5 * 60_000;
const BURST_MS = 800;

type Burst = { id: number; group: AgeGroup; x: number; y: number; kind: "plus" | "minus" };

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
  // Where the last press landed on each card, in percent, so feedback rises from the finger.
  const touchPointRef = useRef<Record<AgeGroup, { x: number; y: number }>>({ u15: { x: 50, y: 50 }, o15: { x: 50, y: 50 } });
  const [bursts, setBursts] = useState<Burst[]>([]);
  const burstId = useRef(0);
  const addBurst = useCallback((group: AgeGroup, kind: Burst["kind"]) => {
    const id = ++burstId.current;
    const { x, y } = touchPointRef.current[group];
    setBursts((list) => [...list.slice(-6), { id, group, x, y, kind }]);
    setTimeout(() => setBursts((list) => list.filter((burst) => burst.id !== id)), BURST_MS);
  }, []);

  // Event & Duplicate tracking states
  const [dayEvents, setDayEvents] = useState<ChaxterEvent[]>([]);
  const currentDayEvent = dayEvents[0] ?? null;

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

      // Latest active visit per group, for the "Zuletzt" label on each card.
      const activeDayEvents = readEvents(localStorage)
        .filter((e) => dayKey(new Date(e.timestamp)) === day && !(e as TrackEvent & { cancelled?: boolean }).cancelled)
        .sort((a, b) => (b.order ?? Date.parse(b.timestamp)) - (a.order ?? Date.parse(a.timestamp)));
      setLatestByGroup({
        u15: activeDayEvents.find((e) => e.group === "u15") ?? null,
        o15: activeDayEvents.find((e) => e.group === "o15") ?? null,
      });

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
    const date = backfillDay ? backfillTime(backfillDay) : new Date();
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
    refresh();
    const day = backfillDay ?? dayKey();
    setFeedback(`${group === "u15" ? "U15" : "Ü15"}: Besuch ${backfillDay ? `für ${shortDay(backfillDay)} nachgetragen` : "gespeichert"}. ${displayCounts(localStorage, day)[group]} ${backfillDay ? "an diesem Tag" : "heute"}.`);
    clearTimeout(timers.current[group]);
    setFlash((value) => ({ ...value, [group]: true }));
    timers.current[group] = setTimeout(() => setFlash((value) => ({ ...value, [group]: false })), 150);
    addBurst(group, "plus");
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
    setTimeout(() => setDecrementFlash((value) => ({ ...value, [group]: false })), 400);
    addBurst(group, "minus");
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
    const rect = e.currentTarget.getBoundingClientRect();
    touchPointRef.current[group] = { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
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
    if (e.detail === 0) touchPointRef.current[group] = { x: 50, y: 50 };
    if (isLongPressRef.current[group]) {
      isLongPressRef.current[group] = false;
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
        <div className="count-header-left">
          <ChaxterLogo className="header-brand" />
          <Link href="/konto" className="header-tool header-account-link" aria-label="Konto und Einstellungen" title={`Konto: ${user.username}`}>
            <Icon name="user" />
          </Link>
          <Link href="/statistik" className="header-tool header-stats-btn" aria-label="Statistik" title="Statistik öffnen">
            <Icon name="stats" />
            <span className="stats-label">Statistik</span>
          </Link>
        </div>

        <div className="count-header-center">
          <output className="day-total" aria-label={ready && selectedDay ? `Gesamtzahl am ${selectedDay}: ${counts.u15 + counts.o15}` : "Gesamtzahl wird geladen"} aria-live="polite">
            <RollingNumber value={ready ? counts.u15 + counts.o15 : null} />
          </output>
          <span className="day-total-sublabel meta">Gesamt</span>
        </div>

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
            className={`header-tool header-event-trigger ${currentDayEvent ? "has-event" : ""}`}
            aria-label={dayEvents.length ? `Events an diesem Tag: ${dayEvents.map((item) => item.title).join(", ")}` : "Event für diesen Tag eintragen"}
            title={dayEvents.length ? `${dayEvents.length === 1 ? "Event" : "Events"}: ${dayEvents.map((item) => item.title).join(", ")}` : "Event für diesen Tag eintragen"}
          >
            <Icon name="calendar" />
            <span className="event-trigger-label">{currentDayEvent ? currentDayEvent.title : "Event"}</span>
          </button>

          <label className="date-chip" title="Tag auswählen" data-past={Boolean(ready && selectedDay && now && selectedDay < dayKey(now))}>
            <time dateTime={selectedDay || undefined} className="date-display-full">
              {selectedDay ? new Date(`${selectedDay}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" }) : "\u00a0"}
            </time>
            <time dateTime={selectedDay || undefined} className="date-display-short">
              {selectedDay ? new Date(`${selectedDay}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" }) : "\u00a0"}
            </time>
            <SyncStatus status={syncStatus} />
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
        </div>
      </header>

      {ready && selectedDay && now && selectedDay < dayKey(now) && (
        <div className="backfill-notice" role="status">
          <span><strong>Nachtrag für {shortDay(selectedDay)}:</strong> Klicks, Undo und Redo gelten für diesen Tag.</span>
          <button type="button" className="backfill-today" onClick={() => { selectedDayRef.current = null; armBackfillTimer(); refresh(); }}>Zurück zu heute</button>
        </div>
      )}

      {/* Big Counting Buttons with Latest Editor directly on the respective button */}
      <div className="count-grid">
        {([ ["u15", "U15", "counter-blue"], ["o15", "Ü15", "counter-yellow"] ] as const).map(([group, label, color]) => {
          const groupLatest = latestByGroup[group];
          // When it was tapped, not the visit time: a backfilled visit carries midnight of its day.
          const tappedAt = groupLatest ? new Date(groupLatest.order ?? Date.parse(groupLatest.timestamp)).toISOString() : "";
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
              <span className="counter-hold-fill" aria-hidden="true" />
              {bursts.filter((burst) => burst.group === group).map((burst) => (
                <span key={burst.id} aria-hidden="true">
                  {burst.kind === "plus" && <span className="counter-ripple" style={{ left: `${burst.x}%`, top: `${burst.y}%` }} />}
                  <span className="counter-pop" data-kind={burst.kind} style={{ left: `${burst.x}%`, top: `${burst.y}%` }}>{burst.kind === "plus" ? "+1" : "−1"}</span>
                </span>
              ))}

              <div className="counter-top-section">
                <span className="counter-title">{label}</span>
                {groupLatest && (
                  <span
                    className="counter-last-user"
                    title={`Zuletzt: ${groupLatest.username || "Mitarbeiter"} um ${new Date(tappedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}
                  >
                    Zuletzt: <strong>{groupLatest.username || "Mitarbeiter"}</strong> <span className="counter-last-time">({formatRelativeTime(tappedAt)})</span>
                  </span>
                )}
              </div>

              <span className="counter-count"><RollingNumber value={ready ? counts[group] : null} /></span>

              <span className="counter-bottom-section">
                <span className="counter-hold-hint" aria-hidden="true">
                  {holdingGroup === group ? "Weiter halten: −1" : "Halten: −1"}
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
          <Icon name="redo" />
          <span>Redo</span>
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!ready || !lastEvent}
          className="undo-button main-undo-button"
          aria-label="Undo: Letzten Besuch rückgängig machen"
        >
          <Icon name="undo" />
          <span>Undo</span>
        </button>
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{feedback}</div>
      {syncStatus.state === "conflict" && <div role="alert" className="error-message">{syncStatus.message} <Link className="underline" href="/login">Anmelden</Link></div>}
      {storageError && <div role="alert" className="error-message">{storageError} <button className="underline" onClick={refresh}>Erneut prüfen</button></div>}
    
      {/* Quick Event Input Modal */}
      <Modal open={showEventModal} onClose={() => { if (!isSavingEvent) setShowEventModal(false); }} title={editingEventId ? "Event bearbeiten" : "Neues Event eintragen"} maxWidth={480} className="interior-modal" showClose={!isSavingEvent}>
            <form onSubmit={handleSaveEvent} className="modal-form">
              <Link href="/events" className="manage-events-link" onClick={() => setShowEventModal(false)}>
                <span>
                  <strong>Events verwalten</strong>
                  <small>Alle Events ansehen, bearbeiten, löschen oder importieren</small>
                </span>
                <span aria-hidden="true">→</span>
              </Link>
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
              <label>
                Tag
                <input type="date" required value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </label>
              <FloatingLabelInput label="Event-Name"
                  required
                  value={eventTitle}
                  onChange={(value) => setEventTitle(value)}
                 />
              <FloatingLabelInput label="Notiz / Uhrzeit (optional)"
                  value={eventDesc}
                  onChange={(value) => setEventDesc(value)}
                 />

              {eventSaveError && <p role="alert" className="error-message">{eventSaveError}</p>}

              <div className="modal-actions">
                <div className="modal-buttons">
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
