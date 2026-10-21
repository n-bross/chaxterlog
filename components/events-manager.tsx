"use client";
import { errorMessage } from "@/lib/errors";
import { convex } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";
import { listDays, listEvents } from "@/lib/client-data";
import { dayKey } from "@/lib/tracking";
import { SegmentedControl } from "./interior/segmented-control";
import { Modal } from "./interior/modal";
import { FloatingLabelInput } from "./interior/floating-label";
import { LoadingButton } from "./interior/loading-button";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ChaxterEvent, ChaxterEventInput } from "@/lib/events";
import { parseEventImport } from "@/lib/events";

interface EventsManagerProps {
  onEventsChange?: (events: ChaxterEvent[]) => void;
  highlightDate?: string;
}

export default function EventsManager({ onEventsChange, highlightDate }: EventsManagerProps) {
  const [events, setEvents] = useState<ChaxterEvent[]>([]);
  const [view, setView] = useState<"upcoming" | "history">("upcoming");
  const [month, setMonth] = useState(() => dayKey().slice(0, 7));
  const [monthVisits, setMonthVisits] = useState<Map<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Single event inputs (Add)
  const [newDate, setNewDate] = useState(highlightDate || new Date().toISOString().slice(0, 10));
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit event inputs
  const [editingEvent, setEditingEvent] = useState<ChaxterEvent | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // Import states
  const [importText, setImportText] = useState("");
  const [parsedPreview, setParsedPreview] = useState<ChaxterEventInput[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadEvents = useCallback(async () => {
    try {
      const items = await listEvents();
      setEvents(items);
      onEventsChange?.(items);
    } catch {
      setError("Events konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [onEventsChange]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // The history calendar shows each day's visitors next to its events; loaded per month on demand.
  useEffect(() => {
    if (view !== "history") return;
    let active = true;
    setMonthVisits(null);
    listDays(`${month}-01`, `${month}-31`)
      .then((days) => { if (active) setMonthVisits(new Map(days.map((d) => [d.date, d.u15 + d.o15]))); })
      .catch(() => { if (active) setMonthVisits(new Map()); });
    return () => { active = false; };
  }, [view, month]);

  // Update preview when importText changes
  useEffect(() => {
    if (!importText.trim()) {
      setParsedPreview([]);
      return;
    }
    try {
      const parsed = parseEventImport(importText);
      setParsedPreview(parsed);
    } catch {
      setParsedPreview([]);
    }
  }, [importText]);

  async function handleAddSingle(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate || !newTitle.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await convex.mutation(api.events.save, { events: [{ date: newDate, title: newTitle.trim(), description: newDesc.trim() || undefined }] });

      setNewTitle("");
      setNewDesc("");
      setShowAddModal(false);
      await loadEvents();
    } catch (err: unknown) {
      setError(errorMessage(err, "Fehler beim Speichern"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleStartEdit(item: ChaxterEvent) {
    setEditingEvent(item);
    setEditDate(item.date);
    setEditTitle(item.title);
    setEditDesc(item.description || "");
    setError(null);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingEvent || !editTitle.trim() || !editDate) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await convex.mutation(api.events.save, { events: [{ id: editingEvent.id, date: editDate, title: editTitle.trim(), description: editDesc.trim() || undefined }] });

      setEditingEvent(null);
      await loadEvents();
    } catch (err: unknown) {
      setError(errorMessage(err, "Fehler beim Speichern der Änderung"));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === "string") {
        setImportText(content);
      }
    };
    reader.readAsText(file);
  }

  async function handleExecuteImport() {
    if (parsedPreview.length === 0) return;

    setIsSubmitting(true);
    setError(null);
    try {
      for (let i = 0; i < parsedPreview.length; i += 100) await convex.mutation(api.events.save, { events: parsedPreview.slice(i, i + 100) });

      setImportText("");
      setParsedPreview([]);
      setShowImportModal(false);
      await loadEvents();
    } catch (err: unknown) {
      setError(errorMessage(err, "Fehler beim Importieren"));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Event "${title}" wirklich löschen?`)) return;

    try {
      await convex.mutation(api.events.remove, { id });
      await loadEvents();
    } catch {
      setError("Event konnte nicht gelöscht werden.");
    }
  }

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(`${dateStr}T12:00:00Z`);
      return d.toLocaleDateString("de-DE", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const todayStr = dayKey();
  const upcoming = events.filter((item) => item.date >= todayStr).sort((x, y) => x.date.localeCompare(y.date));
  const past = events.filter((item) => item.date < todayStr);
  const monthEvents = past.filter((item) => item.date.startsWith(month)).sort((x, y) => x.date.localeCompare(y.date));
  const shiftMonth = (delta: number) => {
    const date = new Date(`${month}-15T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    setMonth(date.toISOString().slice(0, 7));
  };
  const monthTitle = new Date(`${month}-15T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC", month: "long", year: "numeric" });
  const calendarCells = (() => {
    const first = new Date(`${month}-01T12:00:00Z`);
    const lead = (first.getUTCDay() + 6) % 7;
    const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  })();

  const renderRow = (item: ChaxterEvent) => {
    const isToday = item.date === todayStr;
    const isHighlighted = highlightDate && item.date === highlightDate;
    return (
      <div key={item.id} className={`event-item-row ${isToday ? "event-today" : ""} ${isHighlighted ? "event-highlighted" : ""}`}>
        <div className="event-date-col">
          <span className="event-date-text">{formatDateDisplay(item.date)}</span>
          {isToday && <span className="event-badge-today">Heute</span>}
        </div>
        <div className="event-content-col is-clickable" onClick={() => handleStartEdit(item)} title="Klicken zum Bearbeiten">
          <strong className="event-title">{item.title}</strong>
          {item.description && <span className="event-desc">{item.description}</span>}
        </div>
        <div className="event-action-col">
          <button type="button" className="event-edit-btn" title="Event bearbeiten" aria-label={`Event "${item.title}" bearbeiten`} onClick={() => handleStartEdit(item)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
          </button>
          <button type="button" className="event-delete-btn" title="Event löschen" aria-label={`Event "${item.title}" löschen`} onClick={() => handleDelete(item.id, item.title)}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="events-manager-section analytics-panel" aria-label="Veranstaltungen und Events">
      <div className="events-manager-header">
        <div>
          <h3>Events &amp; Veranstaltungen</h3>
          <p>Besondere Aktionen, Ferienprogramme oder Feste verwalten</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="secondary-button btn-small"
            onClick={() => {
              setNewDate(highlightDate || todayStr);
              setShowAddModal(true);
            }}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Event
          </button>
          <button
            type="button"
            className="secondary-button btn-small"
            onClick={() => setShowImportModal(true)}
          >
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 17v3h16v-3" /></svg>
            Import
          </button>
        </div>
      </div>

      {error && <p role="alert" className="error-message">{error}</p>}

      <SegmentedControl className="events-view-switch" label="Ansicht" value={view} onValueChange={(value) => setView(value as "upcoming" | "history")}
        options={[{ value: "upcoming", label: `Kommend (${upcoming.length})` }, { value: "history", label: `Verlauf (${past.length})` }]} />

      {loading ? (
        <p className="analytics-note">Events werden geladen …</p>
      ) : view === "upcoming" ? (
        upcoming.length === 0 ? (
          <p className="events-empty">Keine kommenden Events. Mit <strong>+ Event</strong> oder <strong>Import</strong> lassen sich neue eintragen; vergangene stehen unter „Verlauf“.</p>
        ) : (
          <div className="events-table-wrapper"><div className="events-scroll-list">{upcoming.map(renderRow)}</div></div>
        )
      ) : (
        <div className="event-history">
          <div className="calendar-nav">
            <button type="button" className="period-arrow" aria-label="Vorheriger Monat" onClick={() => shiftMonth(-1)}>←</button>
            <h4 aria-live="polite">{monthTitle}</h4>
            <button type="button" className="period-arrow" aria-label="Nächster Monat" disabled={month >= todayStr.slice(0, 7)} onClick={() => shiftMonth(1)}>→</button>
          </div>
          <div className="calendar-grid" role="grid" aria-label={`Kalender ${monthTitle}`}>
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((label) => <span key={label} className="calendar-weekday" role="columnheader">{label}</span>)}
            {calendarCells.map((date, index) => {
              if (!date) return <span key={`lead-${index}`} className="calendar-cell is-empty" aria-hidden="true" />;
              const dayEvents = past.filter((item) => item.date === date);
              const visits = monthVisits?.get(date) ?? 0;
              return (
                <div key={date} role="gridcell" className={`calendar-cell ${dayEvents.length ? "has-event" : ""} ${date === todayStr ? "is-today" : ""} ${date > todayStr ? "is-future" : ""}`}
                  aria-label={`${formatDateDisplay(date)}: ${visits} Besuche${dayEvents.length ? `, ${dayEvents.map((item) => item.title).join(", ")}` : ""}`}>
                  <span className="calendar-day">{Number(date.slice(8))}</span>
                  {visits > 0 && <span className="calendar-visits">{visits}</span>}
                  {dayEvents.map((item) => (
                    <button key={item.id} type="button" className="calendar-event" title={item.title} onClick={() => handleStartEdit(item)}>{item.title}</button>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="calendar-legend"><span className="calendar-visits">42</span> Besuche an diesem Tag · <span className="calendar-legend-event" /> Event</p>
          {monthEvents.length > 0 ? (
            <div className="events-table-wrapper"><div className="events-scroll-list">{monthEvents.map(renderRow)}</div></div>
          ) : (
            <p className="events-empty">Keine Events im {monthTitle}.</p>
          )}
        </div>
      )}

      {/* Edit Event Modal */}
      <Modal open={!!editingEvent} onClose={() => { if (!isSubmitting) setEditingEvent(null); }} title="Event bearbeiten" maxWidth={480} className="interior-modal" showClose={!isSubmitting}>
            <form onSubmit={handleSaveEdit} className="modal-form">
              <label>
                Datum
                <input type="date" required value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              </label>
              <FloatingLabelInput label="Name / Bezeichnung"
                  required
                  value={editTitle}
                  onChange={(value) => setEditTitle(value)}
                 />
              <FloatingLabelInput label="Notiz / Beschreibung (optional)"
                  value={editDesc}
                  onChange={(value) => setEditDesc(value)}
                 />
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditingEvent(null)}
                  disabled={isSubmitting}
                >
                  Abbrechen
                </button>
                <LoadingButton type="submit" className="primary-button" disabled={isSubmitting || !editTitle.trim()} busy={isSubmitting} busyLabel="Wird gespeichert …">{"Änderung speichern"}</LoadingButton>
              </div>
            {error && <p role="alert" className="error-message">{error}</p>}
            </form>
      </Modal>

      {/* Add Single Event Modal */}
      <Modal open={showAddModal} onClose={() => { if (!isSubmitting) setShowAddModal(false); }} title="Event hinzufügen" maxWidth={480} className="interior-modal" showClose={!isSubmitting}>
            <form onSubmit={handleAddSingle} className="modal-form">
              <label>
                Datum
                <input type="date" required value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </label>
              <FloatingLabelInput label="Titel / Bezeichnung"
                  required
                  value={newTitle}
                  onChange={(value) => setNewTitle(value)}
                 />
              <FloatingLabelInput label="Notiz / Beschreibung (optional)"
                  value={newDesc}
                  onChange={(value) => setNewDesc(value)}
                 />
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                >
                  Abbrechen
                </button>
                <LoadingButton type="submit" className="primary-button" disabled={isSubmitting || !newTitle.trim()} busy={isSubmitting} busyLabel="Speichern …">{"Speichern"}</LoadingButton>
              </div>
            {error && <p role="alert" className="error-message">{error}</p>}
            </form>
      </Modal>

      {/* Import Modal */}
      <Modal open={showImportModal} onClose={() => { if (!isSubmitting) setShowImportModal(false); }} title="Events importieren" maxWidth={680} className="interior-modal" showClose={!isSubmitting}>
            <div className="modal-form">
              <div className="import-row">
                <input
                  type="file"
                  accept=".ics,.csv,.txt,.tsv"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  className="secondary-button btn-small"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Datei auswählen (.ics, .csv, .txt)
                </button>
                <span>oder unten direkt aus Excel oder Text einfügen</span>
              </div>

              <label>
                Liste oder ICS-Inhalt
                <textarea
                  rows={4}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={`Beispiel CSV/Excel:\n25.10.2026; Herbstfest; Großes Buffet\n31.10.2026; Halloween-Party\n01.11.2026; Kicker-Turnier`}
                  className="font-mono"
                />
              </label>

              {importText.trim() && (() => {
                const ics = /BEGIN:(VCALENDAR|VEVENT)/.test(importText);
                if (!parsedPreview.length) return <p role="status" className="error-message">{ics ? "Keine Termine erkannt. Jeder Termin braucht DTSTART und SUMMARY." : "Keine Events erkannt. Jede Zeile braucht ein Datum (TT.MM.JJJJ oder JJJJ-MM-TT) und einen Titel, z. B. „25.10.2026; Herbstfest“."}</p>;
                const skipped = ics ? 0 : importText.split(/\r?\n/).filter((line) => line.trim()).length - parsedPreview.length;
                return skipped > 0 ? <p role="status" className="muted">{skipped} {skipped === 1 ? "Zeile wird" : "Zeilen werden"} übersprungen (kein erkennbares Datum oder kein Titel, z. B. Kopfzeile).</p> : null;
              })()}

              {parsedPreview.length > 0 && (
                <div className="import-preview-box">
                  <div className="import-preview-head">
                    <strong>
                      {parsedPreview.length} {parsedPreview.length === 1 ? "Event" : "Events"} erkannt
                    </strong>
                    <span className="meta">Vorschau</span>
                  </div>
                  <div className="preview-list">
                    {parsedPreview.slice(0, 15).map((p, idx) => (
                      <div key={idx}>
                        <span className="preview-date">{p.date}</span>
                        <span className="preview-title">{p.title}</span>
                        {p.description && <span className="preview-desc">{p.description}</span>}
                      </div>
                    ))}
                    {parsedPreview.length > 15 && (
                      <p className="muted">… und {parsedPreview.length - 15} weitere</p>
                    )}
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowImportModal(false)}
                  disabled={isSubmitting}
                >
                  Abbrechen
                </button>
                <LoadingButton type="button" className="primary-button" onClick={handleExecuteImport}
                  disabled={isSubmitting || parsedPreview.length === 0} busy={isSubmitting} busyLabel="Wird importiert …">
                  {`${parsedPreview.length} ${parsedPreview.length === 1 ? "Event" : "Events"} übernehmen`}
                </LoadingButton>
              </div>
            </div>
      {error && <p role="alert" className="error-message">{error}</p>}
      </Modal>
    </section>
  );
}
