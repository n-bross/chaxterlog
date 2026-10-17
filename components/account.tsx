"use client";
import Link from "next/link";
import ChaxterLogo from "./chaxter-logo";
import { useEffect, useState, type FormEvent } from "react";
import { CHECK_UPDATE } from "@/lib/app-update";
import { authClient } from "@/lib/auth-client";
import { getDevice, renameDevice, type Device } from "@/lib/device";
import { readRecords } from "@/lib/sync-state";
import { sendDiagnosticReport } from "@/lib/support";

export default function Account({ user }: { user: { username: string; role: string } }) {
  const [device, setDevice] = useState<Device | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Support / Diagnostic state
  const [supportNotes, setSupportNotes] = useState("");
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportMsg, setSupportMsg] = useState("");

  // Download export state
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  useEffect(() => {
    try {
      setDevice(getDevice());
    } catch {
      setMessage("Browserspeicher nicht verfügbar.");
    }
  }, []);

  async function saveDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const value = renameDevice(String(new FormData(event.currentTarget).get("name")));
      setDevice(value);
      const response = await fetch("/api/device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      setMessage(
        response.ok
          ? "Gerätename gespeichert. Neue Klicks verwenden diesen Namen."
          : "Gerätename lokal gespeichert. Server gerade nicht erreichbar."
      );
    } catch {
      setMessage("Gerätename konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget,
      values = new FormData(form);
    try {
      const result = await authClient.changePassword({
        currentPassword: String(values.get("current")),
        newPassword: String(values.get("new")),
        revokeOtherSessions: true,
      });
      if (result.error) setMessage("Passwort nicht geändert. Bisheriges Passwort prüfen.");
      else {
        setMessage("Passwort geändert. Andere Anmeldungen wurden beendet.");
        form.reset();
      }
    } catch {
      setMessage("Verbindung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSendSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSupportBusy(true);
    setSupportMsg("");
    try {
      await sendDiagnosticReport(supportNotes);
      setSupportMsg("✓ Diagnosebericht erfolgreich gesendet. Der Admin kann den Zustand nun in der Admin-Ansicht prüfen.");
      setSupportNotes("");
    } catch (err) {
      setSupportMsg(err instanceof Error ? err.message : "Diagnosebericht konnte nicht übertragen werden.");
    } finally {
      setSupportBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      if (readRecords(localStorage).some((event) => !event.synced)) {
        setMessage(
          "Es gibt noch nicht synchronisierte Klicks. Erst zur Zählung zurückkehren und den grünen Sync-Punkt abwarten."
        );
        return;
      }
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      window.location.assign("/login");
    } catch {
      setMessage("Abmelden fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const invalidExportRange = !!exportFrom && !!exportTo && exportFrom > exportTo;
  function downloadExport(format: string) {
    return `/api/admin/export?${new URLSearchParams({ format, from: exportFrom, to: exportTo })}`;
  }

  return (
    <main className="manage-screen">
      <header className="manage-header">
        <Link className="back-link" href="/">
          ← Zählung
        </Link>
        <h1>Konto</h1>
        <div className="account-brand">
          <ChaxterLogo />
        </div>
      </header>

      <section className="manage-card">
        <div className="account-user-row">
          <span>Angemeldet als</span>
          <strong>{user.username}</strong>
        </div>
        <div className="button-row">
          {user.role === "admin" && (
            <Link className="primary-button" href="/admin">
              Admin-Ansicht
            </Link>
          )}
          <button className="secondary-button" disabled={busy} onClick={logout}>
            Abmelden
          </button>
        </div>
      </section>

      {/* Download function for all users */}
      <section className="manage-card">
        <h2>Daten herunterladen</h2>
        <div className="form-row">
          <label>
            Von
            <input type="date" value={exportFrom} onChange={(event) => setExportFrom(event.target.value)} />
          </label>
          <label>
            Bis
            <input type="date" value={exportTo} onChange={(event) => setExportTo(event.target.value)} />
          </label>
        </div>
        <p className="muted">
          CSV- und JSON-Exporte der erfassten Besuche und Korrekturen. Ohne Datum wird der gesamte Datenbestand heruntergeladen.
        </p>
        {invalidExportRange ? (
          <p role="alert">Das Enddatum liegt vor dem Anfangsdatum.</p>
        ) : (
          <div className="button-row">
            <a className="primary-button" href={downloadExport("csv")} download>
              Einzelbesuche · CSV
            </a>
            <a className="secondary-button" href={downloadExport("daily")} download>
              Tageswerte · CSV
            </a>
            <a className="secondary-button" href={downloadExport("corrections")} download>
              Undo &amp; Redo · CSV
            </a>
            <a className="secondary-button" href={downloadExport("json")} download>
              Alle Details · JSON
            </a>
          </div>
        )}
      </section>

      <section className="manage-card">
        <h2>Hilfe & Diagnose senden</h2>
        <p className="muted">
          Falls auf diesem Gerät Probleme auftreten (z. B. Synchronisation hängt oder Zählerwerte unklar), kannst du hier einen Diagnosebericht direkt an den Administrator senden.
        </p>
        <form onSubmit={handleSendSupport}>
          <label>
            Was ist das Problem? (optional)
            <textarea
              rows={3}
              value={supportNotes}
              onChange={(e) => setSupportNotes(e.target.value)}
              placeholder="Z. B. Der grüne Punkt erscheint nicht, falsche Klickzahl etc."
              maxLength={2000}
            />
          </label>
          <button className="primary-button" disabled={supportBusy}>
            {supportBusy ? "Wird gesendet …" : "Diagnosebericht an Admin senden"}
          </button>
        </form>
        {supportMsg && <p role="status" className="manage-message">{supportMsg}</p>}
      </section>

      <section className="manage-card">
        <h2>Dieses Gerät</h2>
        <p className="muted">
          Eine Kennung pro Browserinstallation. Verschiedene Browser auf demselben Tablet bekommen eigene Kennungen.
        </p>
        {device && (
          <>
            <div className="device-info-pill">
              <span>{device.platform}</span>
              <span>·</span>
              <span>ID: {device.id.slice(0, 8)}</span>
            </div>
            <form onSubmit={saveDevice}>
              <label>
                Gerätename
                <input name="name" defaultValue={device.name} required maxLength={60} />
              </label>
              <button className="primary-button" disabled={busy}>
                Gerätenamen speichern
              </button>
            </form>
          </>
        )}
      </section>

      <section className="manage-card">
        <h2>Passwort ändern</h2>
        <form onSubmit={password}>
          <label>
            Bisheriges Passwort
            <input name="current" type="password" autoComplete="current-password" required maxLength={128} />
          </label>
          <label>
            Neues Passwort
            <input name="new" type="password" autoComplete="new-password" required minLength={10} maxLength={128} />
          </label>
          <button className="primary-button" disabled={busy}>
            Passwort ändern
          </button>
        </form>
      </section>

      <section className="manage-card">
        <h2>App-Version</h2>
        <p className="muted">
          Neue Versionen werden automatisch geprüft und nach dem Synchronisieren in einer Bedienpause geladen.
        </p>
        <button className="secondary-button" onClick={() => window.dispatchEvent(new Event(CHECK_UPDATE))}>
          Nach Updates suchen
        </button>
      </section>

      {message && (
        <p role="status" className="manage-message">
          {message}
        </p>
      )}
    </main>
  );
}
