"use client";
import Link from "next/link";
import ChaxterLogo from "./chaxter-logo";
import { useEffect, useState, type FormEvent } from "react";
import { CHECK_UPDATE } from "@/lib/app-update";
import { authClient } from "@/lib/auth-client";
import { getDevice, renameDevice, type Device } from "@/lib/device";
import { readRecords } from "@/lib/sync-state";

export default function Account({ user }: { user: { username: string; role: string } }) {
  const [device, setDevice] = useState<Device | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

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
