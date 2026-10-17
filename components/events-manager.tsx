"use client";

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

  // Single event inputs
  const [newDate, setNewDate] = useState(highlightDate || new Date().toISOString().slice(0, 10));
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
                    <div className="event-content-col">
                      <strong className="event-title">{item.title}</strong>
                      {item.description && <span className="event-desc">{item.description}</span>}
                    </div>
                    <div className="event-action-col">
                      <button
                        type="button"
                        className="event-delete-btn"
                        title="Event löschen"
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

      {/* Add Single Event Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h4 className="modal-title font-semibold text-lg mb-3">Neues Event anlegen</h4>
            <form onSubmit={handleAddSingle} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Datum:</label>
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full text-base p-2 rounded border border-gray-700 bg-gray-900 text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Titel / Bezeichnung:</label>
                <input
                  type="text"
                  required
                  placeholder="z. B. Sommerfest, Kickerturnier, Kinoabend"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-base p-2 rounded border border-gray-700 bg-gray-900 text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Notiz / Beschreibung (optional):</label>
                <input
                  type="text"
                  placeholder="z. B. 14:00 - 18:00 Uhr, mit Grillen"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full text-base p-2 rounded border border-gray-700 bg-gray-900 text-white"
                />
              </div>
              <div className="modal-actions flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSubmitting || !newTitle.trim()}
                >
                  {isSubmitting ? "Speichern …" : "Speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="modal-backdrop" onClick={() => setShowImportModal(false)}>
          <div className="modal-content modal-wide" onClick={(e) => e.stopPropagation()}>
            <h4 className="modal-title font-semibold text-lg mb-2">Events importieren</h4>
            <p className="text-xs text-muted mb-3">
              Unterstützt Kalender-Exporte (<strong>.ics</strong> von Apple Kalender / Google Kalender), CSV oder kopierte Excel-Listen (Spalten: Datum, Titel, Beschreibung).
            </p>

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
                  className="w-full text-sm font-mono p-2 rounded border border-gray-700 bg-gray-900 text-white resize-y"
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
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleExecuteImport}
                  disabled={isSubmitting || parsedPreview.length === 0}
                >
                  {isSubmitting ? "Wird importiert …" : `${parsedPreview.length} Event(s) übernehmen`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
