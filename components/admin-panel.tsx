"use client";
import { errorMessage } from "@/lib/errors";
import { convex } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FloatingLabelInput } from "./interior/floating-label";
import { LoadingButton } from "./interior/loading-button";
import { Accordion, AccordionSection } from "./interior/accordion";
import RemoteActivity from "./remote-activity";
import DeleteEntriesDialog from "./delete-entries-dialog";
import { dayKey } from "@/lib/tracking";
import { addDays } from "@/lib/statistics";
import { Dropdown } from "./interior/dropdown";
import { PasswordStrength } from "./interior/password-strength";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";

// Individual clicks and corrections load only while this section is open.
function ActivitySection() {
  const [open, setOpen] = useState<readonly string[]>([]);
  const [from, setFrom] = useState(() => addDays(dayKey(), -6));
  const [to, setTo] = useState(() => dayKey());
  const content = (
    <div className="accordion-content">
      <div className="form-row">
        <label>Von<input type="date" value={from} max={to} onChange={(event) => { if (event.target.value) setFrom(event.target.value); }} /></label>
        <label>Bis<input type="date" value={to} min={from} onChange={(event) => { if (event.target.value) setTo(event.target.value); }} /></label>
      </div>
      <RemoteActivity range={{ start: from, end: to }} />
    </div>
  );
  return <Accordion headingLevel={2} maxPanelHeight={100000} open={open} onOpenChange={setOpen}
    items={[{ id: "activity", title: <span className="accordion-heading"><span>Aktivitätsprotokoll</span><span className="accordion-description">Einzelne Klicks mit Benutzer und Gerät, Undo und Redo</span></span>, content: open.includes("activity") ? content : null }]} />;
}

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
  cursors: { users: string | null; devices: string | null; reports: string | null };
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
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [createPassword, setCreatePassword] = useState("");
  const [resetUserId, setResetUserId] = useState<string>("");
  const [createUsername, setCreateUsername] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [entriesUser, setEntriesUser] = useState<User | null>(null);

  const load = useCallback(async () => {
    try {
      const paginationOpts = { cursor: null, numItems: 50 };
      const [users, devices, reports] = await Promise.all([
        convex.query(api.admin.users, { paginationOpts }),
        convex.query(api.admin.devices, { paginationOpts }),
        convex.query(api.admin.reports, { paginationOpts }),
      ]);
      setData({ users: users.page, devices: devices.page, reports: reports.page, cursors: { users: users.isDone ? null : users.continueCursor, devices: devices.isDone ? null : devices.continueCursor, reports: reports.isDone ? null : reports.continueCursor } });
      setError("");
    } catch {
      setError("Admin-Daten konnten nicht geladen werden.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel*='icon']");
    let created = false;
    let prevHref = "";
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
      created = true;
    } else {
      prevHref = link.href;
    }
    link.href = "/admin-icon.svg";
    return () => {
      if (created) {
        link?.remove();
      } else if (link && prevHref) {
        link.href = prevHref;
      }
    };
  }, []);

  async function more(kind: "users" | "devices" | "reports") {
    if (!data?.cursors[kind]) return;
    setBusy(true);
    try {
      const paginationOpts = { cursor: data.cursors[kind], numItems: 50 };
      const page = kind === "users" ? await convex.query(api.admin.users, { paginationOpts }) : kind === "devices" ? await convex.query(api.admin.devices, { paginationOpts }) : await convex.query(api.admin.reports, { paginationOpts });
      setData({ ...data, [kind]: [...(data[kind] ?? []), ...page.page], cursors: { ...data.cursors, [kind]: page.isDone ? null : page.continueCursor } });
    } catch { setMessage("Weitere Einträge konnten nicht geladen werden."); }
    finally { setBusy(false); }
  }

  async function change(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await convex.mutation(api.admin.change, { action: String(body.action), ...(typeof body.username === "string" ? { username: body.username } : {}), ...(typeof body.password === "string" ? { password: body.password } : {}), ...(typeof body.userId === "string" ? { userId: body.userId } : {}) });
      setMessage("Änderung gespeichert.");
      await load();
      return true;
    } catch (error) {
      setMessage(errorMessage(error, "Änderung fehlgeschlagen. Bitte Verbindung prüfen."));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleSupportAction(action: "toggleResolved" | "delete", report: SupportReport) {
    setBusy(true);
    setMessage("");
    try {
      await convex.mutation(api.support.change, { action, reportId: report.id as Id<"support">, resolved: !report.resolved });
      setMessage(action === "delete" ? "Meldung gelöscht." : "Status aktualisiert.");
      await load();
    } catch (err) {
      setMessage(errorMessage(err, "Änderung fehlgeschlagen. Bitte Verbindung prüfen."));
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    if (await change({ action: "create", username: values.get("username"), password: values.get("password") })) {
      form.reset();
      setCreateUsername("");
      setCreatePassword("");
    }
  }

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    if (!effectiveResetUserId) { setMessage("Bitte zuerst einen Mitarbeiter auswählen."); return; }
    if (
      await change({
        action: "password",
        userId: effectiveResetUserId,
        password: values.get("password"),
      })
    ) {
      form.reset();
      setResetPassword("");
    }
  }

  const openReportsCount = data?.reports?.filter((r) => !r.resolved).length ?? 0;
  const nonAdminUsers = data?.users.filter((user) => user.role !== "admin") ?? [];
  // No preselected user: resetting the wrong colleague's password must be a deliberate choice.
  const effectiveResetUserId = nonAdminUsers.some((user) => user.id === resetUserId) ? resetUserId : "";

  return (
    <main className="manage-screen">
      <header className="manage-header">
        <Link className="back-link" href="/konto">
          <span className="back-arrow" aria-hidden="true">←</span> Konto
        </Link>
        <h1>Admin</h1>
        <div className="account-brand">
          <span className="badge-highlight">Admin</span>
        </div>
      </header>

      {error && <p role="alert" className="error-message">{error}</p>}
      {message && (
        <aside className="notification" role="status" aria-live="polite">
          {message}
        </aside>
      )}

      {/* Support & Diagnosemeldungen */}
      <AccordionSection
        title="Support & Diagnosemeldungen"
        description={
          openReportsCount > 0
            ? `${openReportsCount} offene ${openReportsCount === 1 ? "Meldung" : "Meldungen"} von Geräten`
            : "Keine offenen Problemmeldungen"
        }
        meta={openReportsCount > 0 ? `${openReportsCount} offen` : undefined}
      >
        {(!data?.reports || data.reports.length === 0) ? (
          <p className="muted">Bisher wurden keine Diagnoseberichte übermittelt.</p>
        ) : (
          <div className="report-list">
            {data.reports.map((report) => {
              const isExpanded = expandedReportId === report.id;
              return (
                <div
                  key={report.id}
                  className={`report-card ${report.resolved ? "report-resolved" : ""}`}
                >
                  <div className="report-card-header">
                    <div>
                      <strong>{report.device_name || "Unbenanntes Gerät"}</strong>
                      <span className="report-meta">
                        {" · "}
                        {date(report.created_at)}
                        {report.username ? ` · Benutzer: ${report.username}` : ""}
                      </span>
                    </div>
                    <span className={`status-pill ${report.resolved ? "resolved" : "open"}`}>
                      {report.resolved ? "Erledigt" : "Offen"}
                    </span>
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
                        <pre className="system-info-pre">
                          {JSON.stringify(report.system_info, null, 2)}
                        </pre>
                      )}
                      {report.queue_sample && (
                        <div className="queue-sample-box">
                          <strong>Ausstehende Aktionen ({report.unsynced_count}):</strong>
                          <pre className="system-info-pre">
                            {JSON.stringify(report.queue_sample, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {data?.cursors.reports && <button className="secondary-button load-more" disabled={busy} onClick={() => more("reports")}>Weitere Meldungen laden</button>}
      </AccordionSection>

      {/* Benutzerverwaltung */}
      <AccordionSection
        title="Mitarbeiter"
        description="Zugänge anlegen, sperren und Passwörter verwalten"
        defaultOpen={true}
      >
        <p className="muted">
          Mitarbeiter können Besuche zählen und eigene Passwörter ändern. Nur Administratoren sehen diesen Bereich.
        </p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Benutzer</th>
                <th scope="col">Rolle</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Aktion</span></th>
              </tr>
            </thead>
            <tbody>
              {data?.users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <span className="user-cell" data-role={user.role}>
                      <span className="user-initial" aria-hidden="true">{user.username.slice(0, 1)}</span>
                      {user.username}
                    </span>
                  </td>
                  <td>{user.role === "admin" ? "Admin" : "Mitarbeiter"}</td>
                  <td><span className={`status-pill ${user.banned ? "banned" : "active"}`}>{user.banned ? "Gesperrt" : "Aktiv"}</span></td>
                  <td>
                    <span className="row-actions">
                      <button type="button" className="secondary-button" disabled={busy} onClick={() => setEntriesUser(user)}>Einträge löschen</button>
                      {user.role !== "admin" && (
                        <button className="danger-button" data-action={user.banned ? "unban" : "ban"} type="button" disabled={busy}
                          onClick={() => void change({ action: user.banned ? "unban" : "ban", userId: user.id })}>
                          {user.banned ? "Freigeben" : "Sperren"}
                        </button>
                      )}
                      {user.role !== "admin" && user.banned && (
                        <button className="danger-button danger-solid" type="button" disabled={busy}
                          onClick={() => { if (window.confirm(`Zugang „${user.username}“ endgültig löschen?\n\nGezählte Besuche bleiben erhalten und zeigen weiter diesen Namen. Sollen auch sie verschwinden, vorher „Einträge löschen“ verwenden.`)) void change({ action: "remove", userId: user.id }); }}>
                          Zugang löschen
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.cursors.users && <button className="secondary-button load-more" disabled={busy} onClick={() => more("users")}>Weitere Mitarbeiter laden</button>}
        <h3>Mitarbeiterzugang anlegen</h3>
        <form onSubmit={create}>
          <FloatingLabelInput label="Benutzername"
              name="username"
              value={createUsername}
              onChange={(val) => setCreateUsername(val.toLowerCase())}
              hint="3–30 Zeichen: Kleinbuchstaben a–z, Ziffern, Punkt, Unterstrich oder Bindestrich. Keine Umlaute oder Leerzeichen."
              required
              minLength={3}
              maxLength={30}
              pattern="[a-z0-9_.\-]{3,30}"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
             />
          <FloatingLabelInput label="Startpasswort"
              name="password"
              type="password"
              value={createPassword}
              onChange={(val) => setCreatePassword(val)}
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
             />
          <PasswordStrength value={createPassword} className="mt-1" />
          <p className="muted">
            Zugangsdaten persönlich weitergeben. Mitarbeiter können ihr Passwort unter „Konto“ ändern.
          </p>
          <LoadingButton className="primary-button" busy={busy}>Zugang anlegen</LoadingButton>
        </form>
        {!!nonAdminUsers.length && (
          <>
            <h3>Passwort neu setzen</h3>
            <form onSubmit={reset}>
              <div className="interior-field w-full">
                <span className="field-label">Mitarbeiter</span>
                <Dropdown
                  name="userId"
                  label="Mitarbeiter"
                  placeholder="Mitarbeiter auswählen"
                  items={nonAdminUsers.map((user) => ({
                    value: user.id,
                    label: user.username,
                  }))}
                  value={effectiveResetUserId}
                  onChange={(val) => setResetUserId(val)}
                  className="w-full"
                />
              </div>
              <FloatingLabelInput label="Neues Startpasswort"
                  name="password"
                  type="password"
                  value={resetPassword}
                  onChange={(val) => setResetPassword(val)}
                  required
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                 />
              <PasswordStrength value={resetPassword} className="mt-1" />
              <p className="muted">Beendet alle bestehenden Anmeldungen dieses Benutzers.</p>
              <LoadingButton className="secondary-button" busy={busy}>Passwort zurücksetzen</LoadingButton>
            </form>
          </>
        )}
      </AccordionSection>

      <ActivitySection />
      <DeleteEntriesDialog user={entriesUser} onClose={() => setEntriesUser(null)} onDone={(text) => { setEntriesUser(null); setMessage(text); window.scrollTo({ top: 0, behavior: "smooth" }); }} />

      <AccordionSection title="Geräte / Browserinstallationen" description="Gerätenamen und letzte Aktivität im Überblick">
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
                  <td title={device.id} className="mono-cell">{device.id.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.cursors.devices && <button className="secondary-button load-more" disabled={busy} onClick={() => more("devices")}>Weitere Geräte laden</button>}
      </AccordionSection>

    </main>
  );
}
