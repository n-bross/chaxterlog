"use client";

import { useMemo, useState } from "react";
import type { VisitRecord } from "@/lib/sync-state";
import { dayKey } from "@/lib/tracking";

export type ActivityItem = {
  id: string;
  kind: "visit" | "undo" | "redo";
  group: "u15" | "o15";
  timestamp: string;
  order: number;
  username?: string;
  deviceName?: string;
  platform?: string;
  deviceId?: string;
  cancelled?: boolean;
  redoOf?: string;
  visitTimestamp?: string;
  visitId?: string;
  isRapidFollow?: boolean;
  rapidDiffSeconds?: number;
  undoneBy?: {
    username?: string;
    timestamp: string;
  };
};

const formatTime = (value: string) =>
  new Date(value).toLocaleTimeString("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export default function ActivityLog({
  records,
  range,
}: {
  records: VisitRecord[];
  range?: { start: string; end: string } | null;
}) {
  const [filter, setFilter] = useState<"all" | "visits" | "corrections" | "cancelled">("all");
  const [page, setPage] = useState(0);

  // Build unified items from records and their corrections
  const items = useMemo(() => {
    const list: ActivityItem[] = [];

    // Map cancelled visits to their undo correction for cross-reference
    const undoMap = new Map<string, { username?: string; timestamp: string }>();
    for (const record of records) {
      for (const corr of record.corrections ?? []) {
        if (corr.kind === "undo") {
          undoMap.set(record.id, { username: corr.username, timestamp: corr.timestamp });
        }
      }
    }

    for (const record of records) {
      const day = dayKey(new Date(record.timestamp));
      if (!range || (day >= range.start && day <= range.end)) {
        // Base visit item
        list.push({
          id: `visit-${record.id}`,
          kind: "visit",
          group: record.group,
          timestamp: record.timestamp,
          order: record.order ?? Date.parse(record.timestamp),
          username: record.username,
          deviceName: record.deviceName,
          platform: record.platform,
          deviceId: record.deviceId,
          cancelled: record.cancelled,
          redoOf: record.redoOf,
          undoneBy: undoMap.get(record.id),
        });
      }

      // Add individual corrections as chronological timeline items
      for (const corr of record.corrections ?? []) {
        const corrDay = dayKey(new Date(corr.timestamp));
        if (!range || (corrDay >= range.start && corrDay <= range.end)) {
          list.push({
            id: `corr-${corr.id}`,
            kind: corr.kind,
            group: record.group,
            timestamp: corr.timestamp,
            order: corr.order ?? Date.parse(corr.timestamp),
            username: corr.username,
            deviceName: corr.deviceName,
            platform: corr.platform,
            deviceId: corr.deviceId,
            visitId: record.id,
            visitTimestamp: record.timestamp,
          });
        }
      }
    }

    // Sort newest first
    list.sort((a, b) => b.order - a.order || b.id.localeCompare(a.id));

    // Detect rapid sequence visits in the same group (< 5 seconds)
    const visits = list.filter((i) => i.kind === "visit");
    for (let i = 0; i < visits.length - 1; i++) {
      const current = visits[i];
      const older = visits[i + 1];
      if (current.group === older.group) {
        const diff = Math.abs(current.order - older.order);
        if (diff < 5000) {
          current.isRapidFollow = true;
          current.rapidDiffSeconds = Math.max(1, Math.round(diff / 1000));
        }
      }
    }

    return list;
  }, [records, range]);

  // Apply filter
  const filtered = useMemo(() => {
    if (filter === "visits") return items.filter((item) => item.kind === "visit" && !item.cancelled);
    if (filter === "corrections") return items.filter((item) => item.kind === "undo" || item.kind === "redo");
    if (filter === "cancelled") return items.filter((item) => item.kind === "visit" && item.cancelled);
    return items;
  }, [items, filter]);

  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const countCorrections = items.filter((i) => i.kind === "undo" || i.kind === "redo").length;
  const countCancelled = items.filter((i) => i.kind === "visit" && i.cancelled).length;

  return (
    <section className="analytics-panel activity-log-panel" aria-label="Aktivitätsverlauf und Korrekturen">
      <div className="analytics-panel-heading">
        <div>
          <h3 className="text-base font-semibold">Verlauf &amp; Protokoll</h3>
          <p className="text-xs text-muted">
            Chronologische Nachvollziehbarkeit: Zählungen, Rückgängig (Undo) &amp; Wiederhergestellt (Redo)
          </p>
        </div>
        <span className="analytics-basis">{filtered.length} Aktionen</span>
      </div>

      {/* Filter Tabs */}
      <div className="activity-filter-bar" role="group" aria-label="Filter">
        <button
          type="button"
          className={`activity-filter-btn ${filter === "all" ? "active" : ""}`}
          onClick={() => {
            setFilter("all");
            setPage(0);
          }}
        >
          Alle ({items.length})
        </button>
        <button
          type="button"
          className={`activity-filter-btn ${filter === "visits" ? "active" : ""}`}
          onClick={() => {
            setFilter("visits");
            setPage(0);
          }}
        >
          Gezählt ({items.filter((i) => i.kind === "visit" && !i.cancelled).length})
        </button>
        <button
          type="button"
          className={`activity-filter-btn ${filter === "corrections" ? "active" : ""}`}
          onClick={() => {
            setFilter("corrections");
            setPage(0);
          }}
        >
          Korrekturen ({countCorrections})
        </button>
        {countCancelled > 0 && (
          <button
            type="button"
            className={`activity-filter-btn ${filter === "cancelled" ? "active" : ""}`}
            onClick={() => {
              setFilter("cancelled");
              setPage(0);
            }}
          >
            Storniert ({countCancelled})
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="analytics-note">Keine Einträge für die gewählte Ansicht vorhanden.</p>
      ) : (
        <ol className="activity-timeline">
          {visible.map((item) => {
            const isU15 = item.group === "u15";
            return (
              <li
                key={item.id}
                className={`activity-timeline-item activity-${item.kind} ${item.cancelled ? "is-cancelled" : ""}`}
              >
                <div className="activity-item-header">
                  <div className="activity-badge-wrap">
                    {item.kind === "visit" && !item.cancelled && (
                      <span className={`activity-badge badge-${item.group}`}>
                        +1 {isU15 ? "U15" : "Ü15"}
                      </span>
                    )}
                    {item.kind === "visit" && item.cancelled && (
                      <span className="activity-badge badge-cancelled">
                        Storniert: {isU15 ? "U15" : "Ü15"}
                      </span>
                    )}
                    {item.kind === "undo" && (
                      <span className="activity-badge badge-undo">
                        ↩ Undo -1 {isU15 ? "U15" : "Ü15"}
                      </span>
                    )}
                    {item.kind === "redo" && (
                      <span className="activity-badge badge-redo">
                        ↪ Redo +1 {isU15 ? "U15" : "Ü15"}
                      </span>
                    )}
                    {item.isRapidFollow && !item.cancelled && (
                      <span className="status-pill pill-warning" title={`Nur ${item.rapidDiffSeconds}s nach vorherigem Klick erfasst`}>
                        ⚠️ Schnellfolge ({item.rapidDiffSeconds}s)
                      </span>
                    )}
                  </div>

                  <div className="activity-time-wrap">
                    <span className="activity-time">{formatTime(item.timestamp)}</span>
                    <span className="activity-date">{formatDate(item.timestamp)}</span>
                  </div>
                </div>

                <div className="activity-body">
                  {item.kind === "undo" && item.visitTimestamp && (
                    <p className="activity-explanation">
                      <strong>Rückgängig gemacht:</strong> Der Klick ({isU15 ? "U15" : "Ü15"}) von{" "}
                      {formatTime(item.visitTimestamp)} Uhr wurde aus der Zählung abgezogen.
                    </p>
                  )}

                  {item.kind === "redo" && item.visitTimestamp && (
                    <p className="activity-explanation">
                      <strong>Wiederhergestellt:</strong> Der zuvor stornierte Klick ({isU15 ? "U15" : "Ü15"}) wurde
                      wieder zur Zählung hinzugefügt.
                    </p>
                  )}

                  {item.kind === "visit" && item.cancelled && (
                    <p className="activity-explanation text-warning">
                      ⚠️ <strong>Falscher Klick / storniert:</strong> Dieser Eintrag wurde
                      {item.undoneBy ? ` um ${formatTime(item.undoneBy.timestamp)} Uhr per Undo zurückgenommen` : " storniert"}
                      {item.undoneBy?.username ? ` von ${item.undoneBy.username}` : ""}.
                    </p>
                  )}

                  {item.kind === "visit" && item.redoOf && !item.cancelled && (
                    <p className="activity-explanation text-accent">
                      ℹ️ <strong>Per Redo wiederhergestellt</strong>
                    </p>
                  )}

                  {item.isRapidFollow && !item.cancelled && (
                    <p className="activity-explanation text-warning">
                      ⚠️ <strong>Mögliche Doppelzählung:</strong> Dieser Klick erfolgte {item.rapidDiffSeconds} Sekunden nach einer vorherigen {isU15 ? "U15" : "Ü15"}-Erfassung.
                    </p>
                  )}

                  <div className="activity-meta">
                    <span className="activity-user">
                      👤 {item.username || "Benutzer unbekannt"}
                    </span>
                    <span className="activity-device">
                      📱 {item.deviceName || item.platform || "Gerät nicht erfasst"}
                      {item.deviceId && <small> (ID: {item.deviceId.slice(0, 8)})</small>}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {pageCount > 1 && (
        <nav className="events-pagination" aria-label="Verlaufseiten">
          <button
            type="button"
            className="period-arrow"
            aria-label="Vorherige Seite"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            ←
          </button>
          <span>
            Seite {currentPage + 1} von {pageCount}
          </span>
          <button
            type="button"
            className="period-arrow"
            aria-label="Nächste Seite"
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            →
          </button>
        </nav>
      )}
    </section>
  );
}
