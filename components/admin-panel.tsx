"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type User = { id: string; username: string; role: string; banned: boolean | null };
type Device = { id: string; name: string; platform: string; last_seen: string; last_user: string | null };
export type SupportReport = {
  id: string;
  created_at: string;
  user_id: string | null;
  username: string | null;
  device_id: string | null;
  device_name: string | null;
  platform: string | null;
  notes: string;
  user_agent: string;
  app_version: string;
  is_online: boolean;
  unsynced_count: number;
  today_counts: { u15: number; o15: number } | null;
  queue_sample: unknown[] | null;
  system_info: Record<string, unknown> | null;
  resolved: boolean;
};

type Overview = {
  users: User[];
  devices: Device[];
  summary: { total: number; cancelled: number; today: number };
  reports?: SupportReport[];
};

const date = (value: string) =>
  new Date(value).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    dateStyle: "short",
    timeStyle: "short",
  });

export default function AdminPanel() {
  const [data, setData] = useState<Overview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok) throw new Error();
      setData(await response.json());
      setError("");
    } catch {
      setError("Admin-Daten konnten nicht geladen werden.");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  async function change(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Änderung fehlgeschlagen.");
      setMessage("Änderung gespeichert.");
      await load();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Verbindung fehlgeschlagen.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleSupportAction(action: "toggleResolved" | "delete", report: SupportReport) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reportId: report.id,
          resolved: !report.resolved,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Aktion fehlgeschlagen.");
      setMessage(action === "delete" ? "Meldung gelöscht." : "Status aktualisiert.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Verbindung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    if (await change({ action: "create", username: values.get("username"), password: values.get("password") }))
      form.reset();
  }

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    if (
      await change({
        action: "password",
        userId: values.get("userId"),
        password: values.get("password"),
      })
    )
      form.reset();
  }

  const invalidRange = !!from && !!to && from > to;
  function download(format: string) {
    return `/api/admin/export?${new URLSearchParams({ format, from, to })}`;
  }

  const openReportsCount = data?.reports?.filter((r) => !r.resolved).length ?? 0;

  return (
    <main className="manage-screen">
      <header className="manage-header">
        <Link className="back-link" href="/">
          ← Zählung
        </Link>
        <h1>Admin</h1>
        <Link className="back-link" href="/konto">
          Konto
        </Link>
      </header>

      {error && (
        <p role="alert" className="error-message">
          {error} <button onClick={() => void load()}>Erneut versuchen</button>
        </p>
      )}

      <section className="admin-totals" aria-label="Übersicht">
        <div>
          <span>Heute</span>
          <strong>{data?.summary.today ?? "–"}</strong>
        </div>
        <div>
          <span>Gesamt</span>
          <strong>{data?.summary.total ?? "–"}</strong>
        </div>
        <div>
          <span>Storniert</span>
          <strong>{data?.summary.cancelled ?? "–"}</strong>
        </div>
      </section>

      {/* Support & Diagnostics Section */}
      <section className="manage-card">
        <div className="card-header-flex">
          <h2>Hilfe- & Diagnose-Meldungen</h2>
          {openReportsCount > 0 ? (
            <span className="badge-highlight">{openReportsCount} offen</span>
          ) : (
            <span className="badge-subtle">Alles erledigt</span>
          )}
        </div>
        <p className="muted">
          Hier laufen Fehler- und Hilfeberichte von den Tablets und Mobilgeräten ein. Du kannst dir aus der Ferne den genauen Gerätezustand, offene Klicks und Diagnosedaten ansehen.
        </p>

        {(!data?.reports || data.reports.length === 0) ? (
          <p className="muted" style={{ fontStyle: "italic" }}>
            Keine Diagnosemeldungen vorhanden.
          </p>
        ) : (
          <div className="reports-list">
            {data.reports.map((report) => {
              const isExpanded = expandedReportId === report.id;
              return (
                <div key={report.id} className={`report-item ${report.resolved ? "report-resolved" : ""}`}>
                  <div className="report-main">
                    <div className="report-meta">
                      <span className="report-time">{date(report.created_at)}</span>
                      <span className="report-device">
                        {report.device_name ?? "Gerät"} ({report.platform ?? "Unbekannt"})
                      </span>
                      {report.username && (
                        <span className="report-user">von <strong>{report.username}</strong></span>
                      )}
                      <span className={`status-pill ${report.is_online ? "pill-online" : "pill-offline"}`}>
                        {report.is_online ? "Online" : "Offline"}
                      </span>
                      {report.unsynced_count > 0 && (
                        <span className="status-pill pill-warning">
                          {report.unsynced_count} ungesynct
                        </span>
                      )}
                    </div>

                    {report.notes && (
                      <p className="report-notes">
                        <strong>Problem:</strong> {report.notes}
                      </p>
                    )}

                    <div className="report-actions">
                      <button
                        className="secondary-button btn-small"
                        onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                      >
                        {isExpanded ? "Details ausblenden" : "Diagnose-Details ansehen"}
                      </button>
                      <button
                        className="secondary-button btn-small"
                        disabled={busy}
                        onClick={() => void handleSupportAction("toggleResolved", report)}
                      >
                        {report.resolved ? "Wieder öffnen" : "Als erledigt markieren"}
                      </button>
                      <button
                        className="secondary-button btn-small btn-danger"
                        disabled={busy}
                        onClick={() => void handleSupportAction("delete", report)}
                      >
                        Löschen
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="report-detail-box">
                      <h4>Vollständiger Diagnosebericht:</h4>
                      <div className="detail-grid">
                        <div><strong>Geräte-ID:</strong> {report.device_id ?? "–"}</div>
                        <div><strong>App-Version:</strong> {report.app_version || "–"}</div>
                        <div><strong>User-Agent:</strong> {report.user_agent}</div>
                        {report.today_counts && (
                          <div><strong>Lokaler Zählerstand:</strong> U15: {report.today_counts.u15}, Ü15: {report.today_counts.o15}</div>
                        )}
                      </div>
                      {report.system_info && (
                        <details className="raw-json-details">
                          <summary>System- & Netzwerkdetails (JSON)</summary>
                          <pre>{JSON.stringify(report.system_info, null, 2)}</pre>
                        </details>
                      )}
                      {report.queue_sample && report.queue_sample.length > 0 && (
                        <details className="raw-json-details">
                          <summary>Warteschlange ungespeicherter Klicks ({report.queue_sample.length})</summary>
                          <pre>{JSON.stringify(report.queue_sample, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="manage-card">
        <h2>Daten herunterladen</h2>
        <div className="form-row">
          <label>
            Von
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            Bis
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
        </div>
        <p className="muted">
          Ohne Datum: gesamter Bestand. Einzelbesuche enthalten Benutzer, Gerät und Stornierungen. Tageswerte enthalten nur gezählte Besuche. Zeitzone: Berlin.
        </p>
        {invalidRange ? (
          <p role="alert">Das Enddatum liegt vor dem Anfangsdatum.</p>
        ) : (
          <div className="button-row">
            <a className="primary-button" href={download("csv")} download>
              Einzelbesuche · CSV
            </a>
            <a className="secondary-button" href={download("daily")} download>
              Tageswerte · CSV
            </a>
            <a className="secondary-button" href={download("corrections")} download>
              Undo &amp; Redo · CSV
            </a>
            <a className="secondary-button" href={download("json")} download>
              Alle Details · JSON
            </a>
          </div>
        )}
      </section>

      <section className="manage-card">
        <h2>Benutzer</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Benutzername</th>
                <th>Rolle</th>
                <th>Status</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.role === "admin" ? "Admin" : "Mitarbeiter"}</td>
                  <td>{user.banned ? "Gesperrt" : "Aktiv"}</td>
                  <td>
                    {user.role !== "admin" && (
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() =>
                          void change({
                            action: user.banned ? "unban" : "ban",
                            userId: user.id,
                          })
                        }
                      >
                        {user.banned ? "Freigeben" : "Sperren"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Mitarbeiterzugang anlegen</h3>
        <form onSubmit={create}>
          <label>
            Benutzername
            <input
              name="username"
              required
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9_.\-]{3,30}"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label>
            Startpasswort
            <input
              name="password"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
          <p className="muted">
            Zugangsdaten persönlich weitergeben. Mitarbeiter können ihr Passwort unter „Konto“ ändern.
          </p>
          <button className="primary-button" disabled={busy}>
            Zugang anlegen
          </button>
        </form>
        {!!data?.users.some((user) => user.role !== "admin") && (
          <>
            <h3>Passwort neu setzen</h3>
            <form onSubmit={reset}>
              <label>
                Mitarbeiter
                <select name="userId" required>
                  {data.users
                    .filter((user) => user.role !== "admin")
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.username}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Neues Startpasswort
                <input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                />
              </label>
              <p className="muted">Beendet alle bestehenden Anmeldungen dieses Benutzers.</p>
              <button className="secondary-button" disabled={busy}>
                Passwort zurücksetzen
              </button>
            </form>
          </>
        )}
      </section>

      <section className="manage-card">
        <h2>Geräte / Browserinstallationen</h2>
        <p className="muted">
          Gerätenamen lassen sich auf dem jeweiligen Gerät unter „Konto“ ändern. Keine Hardware-ID und keine GPS-Ortung. Letzte Aktivität: letzter Upload oder Speichern des Gerätenamens.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>System / Browser</th>
                <th>Letzter Benutzer</th>
                <th>Letzte Aktivität</th>
                <th>Kennung</th>
              </tr>
            </thead>
            <tbody>
              {data?.devices.map((device) => (
                <tr key={device.id}>
                  <td>{device.name}</td>
                  <td>{device.platform}</td>
                  <td>{device.last_user ?? "–"}</td>
                  <td>{date(device.last_seen)}</td>
                  <td title={device.id}>{device.id.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {message && (
        <p className="manage-message" role="status">
          {message}
        </p>
      )}
    </main>
  );
}
