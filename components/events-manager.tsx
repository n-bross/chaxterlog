"use client";
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
      const res = await fetch("/api/events", { cache: "no-store" });
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      if (Array.isArray(data.events)) {
        setEvents(data.events);
        onEventsChange?.(data.events);
      }
    } catch {
      setError("Events konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [onEventsChange]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

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
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: newDate,
          title: newTitle.trim(),
          description: newDesc.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");

      setNewTitle("");
      setNewDesc("");
      setShowAddModal(false);
      await loadEvents();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern");
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
      const res = await fetch("/api/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEvent.id,
          date: editDate,
          title: editTitle.trim(),
          description: editDesc.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Speichern fehlgeschlagen");

      setEditingEvent(null);
      await loadEvents();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern der Änderung");
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
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: parsedPreview }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import fehlgeschlagen");

      setImportText("");
      setParsedPreview([]);
      setShowImportModal(false);
      await loadEvents();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Fehler beim Importieren");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Event "${title}" wirklich löschen?`)) return;

    try {
      const res = await fetch(`/api/events?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Löschen fehlgeschlagen");
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

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <section className="events-manager-section analytics-panel" aria-label="Veranstaltungen und Events">
      <div className="events-manager-header flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <span>📅</span> Events & Veranstaltungen
          </h3>
          <p className="text-xs text-muted">
            Besondere Aktionen, Ferienprogramme oder Feste verwalten
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="secondary-button btn-small flex items-center gap-1.5"
            onClick={() => {
              setNewDate(highlightDate || todayStr);
              setShowAddModal(true);
            }}
          >
            <span className="text-base font-bold leading-none">+</span>
            <span>Event</span>
          </button>
          <button
            type="button"
            className="secondary-button btn-small flex items-center gap-1.5"
            onClick={() => setShowImportModal(true)}
          >
            <span>📥</span>
            <span>Import</span>
          </button>
        </div>
      </div>

      {error && <p className="error-message mt-2">{error}</p>}

      {/* Events List */}
      <div className="events-list mt-3">
        {loading ? (
          <p className="text-xs text-muted py-2">Events werden geladen …</p>
        ) : events.length === 0 ? (
          <p className="text-xs text-muted py-2">
            Noch keine Events eingetragen. Klicke auf <strong>+ Event</strong> oder <strong>Import</strong>, um Kalender- oder Excel-Listen zu laden.
          </p>
        ) : (
          <div className="events-table-wrapper">
            <div className="events-scroll-list">
              {events.map((item) => {
                const isToday = item.date === todayStr;
                const isHighlighted = highlightDate && item.date === highlightDate;
                return (
                  <div
                    key={item.id}
                    className={`event-item-row ${isToday ? "event-today" : ""} ${isHighlighted ? "event-highlighted" : ""}`}
                  >
                    <div className="event-date-col">
                      <span className="event-date-text">{formatDateDisplay(item.date)}</span>
                      {isToday && <span className="event-badge-today">Heute</span>}
                    </div>
                    <div
                      className="event-content-col is-clickable group"
                      onClick={() => handleStartEdit(item)}
                      title="Klicken zum Bearbeiten des Namens"
                    >
                      <div className="flex items-center gap-1.5">
                        <strong className="event-title group-hover:text-[var(--accent)] transition-colors">
                          {item.title}
                        </strong>
                        <span className="text-xs text-muted opacity-0 group-hover:opacity-100 transition-opacity">
                          ✎
                        </span>
                      </div>
                      {item.description && <span className="event-desc">{item.description}</span>}
                    </div>
                    <div className="event-action-col">
                      <button
                        type="button"
                        className="event-edit-btn"
                        title="Event bearbeiten"
                        aria-label={`Event "${item.title}" bearbeiten`}
                        onClick={() => handleStartEdit(item)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          <path d="m15 5 4 4" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="event-delete-btn"
                        title="Event löschen"
                        aria-label={`Event "${item.title}" löschen`}
                        onClick={() => handleDelete(item.id, item.title)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Edit Event Modal */}
      <Modal open={!!editingEvent} onClose={() => { if (!isSubmitting) setEditingEvent(null); }} title="Event bearbeiten" maxWidth={480} className="interior-modal" showClose={!isSubmitting}>
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Datum:</label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <FloatingLabelInput label="Name / Bezeichnung"
                  required
                  value={editTitle}
                  onChange={(value) => setEditTitle(value)}
                 />
              <FloatingLabelInput label="Notiz / Beschreibung (optional)"
                  value={editDesc}
                  onChange={(value) => setEditDesc(value)}
                 />
              <div className="modal-actions flex justify-end gap-2 pt-2">
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
            <form onSubmit={handleAddSingle} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Datum:</label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <FloatingLabelInput label="Titel / Bezeichnung"
                  required
                  value={newTitle}
                  onChange={(value) => setNewTitle(value)}
                 />
              <FloatingLabelInput label="Notiz / Beschreibung (optional)"
                  value={newDesc}
                  onChange={(value) => setNewDesc(value)}
                 />
              <div className="modal-actions flex justify-end gap-2 pt-2">
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
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept=".ics,.csv,.txt,.tsv"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  className="secondary-button btn-small flex items-center gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📁 Datei auswählen (.ics, .csv, .txt)
                </button>
                <span className="text-xs text-muted">oder unten direkt aus Excel / Text einfügen</span>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Liste oder ICS-Inhalt einfügen:</label>
                <textarea
                  rows={4}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={`Beispiel CSV/Excel:\n25.10.2026; Herbstfest; Großes Buffet\n31.10.2026; Halloween-Party\n01.11.2026; Kicker-Turnier`}
                  className="w-full font-mono resize-y"
                />
              </div>

              {parsedPreview.length > 0 && (
                <div className="import-preview-box p-3 rounded bg-gray-800/60 border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <strong className="text-xs text-emerald-400">
                      ✓ {parsedPreview.length} Event(s) erkannt
                    </strong>
                    <span className="text-xs text-muted">Vorschau</span>
                  </div>
                  <div className="preview-list max-h-40 overflow-y-auto space-y-1 text-xs">
                    {parsedPreview.slice(0, 15).map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2 py-0.5 border-b border-gray-700/50">
                        <span className="font-mono text-gray-300">{p.date}</span>
                        <span className="font-medium text-white flex-1 truncate">{p.title}</span>
                        {p.description && <span className="text-muted text-[11px] truncate max-w-[120px]">{p.description}</span>}
                      </div>
                    ))}
                    {parsedPreview.length > 15 && (
                      <p className="text-muted text-center pt-1">… und {parsedPreview.length - 15} weitere</p>
                    )}
                  </div>
                </div>
              )}

              <div className="modal-actions flex justify-end gap-2 pt-2">
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
                  {`${parsedPreview.length} Event(s) übernehmen`}
                </LoadingButton>
              </div>
            </div>
      {error && <p role="alert" className="error-message">{error}</p>}
      </Modal>
    </section>
  );
}
