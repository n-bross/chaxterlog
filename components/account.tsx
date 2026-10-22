"use client";
import { convex, waitForConnection } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";
import { synchronize } from "@/lib/sync";
import Link from "next/link";
import { AccordionSection } from "./interior/accordion";
import { LoadingButton } from "./interior/loading-button";
import { FloatingLabelInput } from "./interior/floating-label";
import { PasswordStrength } from "./interior/password-strength";
import TwoFactorCard from "./two-factor-card";
import QrLoginCard from "./qr-login-card";
import ApiTokenCard from "./api-token-card";
import ChaxterLogo from "./chaxter-logo";
import { useEffect, useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import { getDevice, renameDevice, type Device } from "@/lib/device";
import { readRecords } from "@/lib/sync-state";
import { sendDiagnosticReport } from "@/lib/support";

export default function Account({ user }: { user: { username: string; role: string } }) {
  const { data: session } = authClient.useSession();
  const [device, setDevice] = useState<Device | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"device" | "password" | "logout" | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [localClicks, setLocalClicks] = useState(0);

  // Support / Diagnostic state
  const [supportNotes, setSupportNotes] = useState("");
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportMsg, setSupportMsg] = useState("");

  useEffect(() => {
    try {
      setDevice(getDevice());
      if (typeof window !== "undefined") {
        setLocalClicks(readRecords(window.localStorage).filter((record) => !record.synced).length);
      }
    } catch {
      setMessage("Browserspeicher nicht verfügbar.");
    }
  }, []);

  async function saveDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("device");
    setMessage("");
    let savedLocally = false;
    try {
      const value = renameDevice(String(new FormData(event.currentTarget).get("name")));
      setDevice(value);
      savedLocally = true;
      if (!await waitForConnection()) throw new Error("offline");
      await convex.mutation(api.devices.rename, value);
      setMessage("Gerätename gespeichert. Neue Klicks verwenden diesen Namen.");
    } catch {
      setMessage(savedLocally ? "Gerätename lokal gespeichert. Server gerade nicht erreichbar." : "Gerätename konnte nicht gespeichert werden.");
    } finally {
      setBusy(null);
    }
  }

  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("password");
    setMessage("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const { error } = await authClient.changePassword({
      currentPassword: String(values.get("current")),
      newPassword: String(values.get("new")),
      revokeOtherSessions: true,
    });
    setBusy(null);
    if (error) {
      setMessage(
        error.message?.includes("current password")
          ? "Bisheriges Passwort stimmt nicht."
          : "Passwort konnte nicht geändert werden. Mindestens 10 Zeichen erforderlich."
      );
    } else {
      setMessage("Passwort geändert. Andere Anmeldungen wurden beendet.");
      form.reset();
      setNewPassword("");
    }
  }

  async function logout() {
    setBusy("logout");
    setMessage("");
    try {
      if (!await waitForConnection()) throw new Error("offline");
      const actor = await convex.query(api.auth.currentUser, {});
      const left = await synchronize(localStorage, (records) => convex.mutation(api.visits.upload, { records }), getDevice(), actor?.id);
      if (left) throw new Error("Offene Klicks zuerst synchronisieren.");
      const { error } = await authClient.signOut();
      if (error) throw new Error("logout failed");
      window.location.assign("/login");
    } catch {
      setMessage("Abmelden benötigt eine Verbindung und vollständig synchronisierte Klicks.");
      setBusy(null);
    }
  }

  return (
    <main className="manage-screen">
      <header className="manage-header">
        <Link className="back-link" href="/">
          <span className="back-arrow" aria-hidden="true">←</span> Zählung
        </Link>
        <h1>Konto</h1>
        <div className="account-brand">
          <ChaxterLogo priority />
        </div>
      </header>

      {message && (
        <aside className="notification" role="status" aria-live="polite">
          {message}
        </aside>
      )}

      {/* Who is signed in stays visible; everything else folds away. */}
      <section className="account-identity" aria-label="Angemeldet als">
        <span className="account-avatar" aria-hidden="true">{user.username.slice(0, 1)}</span>
        <div className="account-identity-text">
          <span className="meta">Angemeldet als</span>
          <span className="account-username">{user.username}</span>
          <span className="status-pill account-role-pill">{user.role === "admin" ? "Administrator" : "Mitarbeiter"}</span>
          <span className="account-sync-line">{localClicks ? `${localClicks} ${localClicks === 1 ? "Klick wartet" : "Klicks warten"} auf Übertragung` : "Alle Klicks übertragen"}</span>
        </div>
        <div className="account-btn-group">
          {user.role === "admin" && (
            <Link className="primary-button" href="/admin">
              Admin-Bereich
            </Link>
          )}
          <LoadingButton
            className="secondary-button"
            disabled={!!busy}
            busy={busy === "logout"}
            busyLabel="Wird abgemeldet …"
            onClick={logout}
          >
            Abmelden
          </LoadingButton>
        </div>
      </section>

      <AccordionSection title="Gerätename ändern" description="Name dieses Browsers in der Statistik festlegen" meta="Gerät">
        {device && (
          <>
            <p className="muted">
              Der Gerätename erscheint im Admin-Bereich und hilft zu erkennen, welches Tablet oder Smartphone gezählt hat.
            </p>
            <form onSubmit={saveDevice}>
              <FloatingLabelInput label="Gerätename" name="name" defaultValue={device.name} required maxLength={40}  />
              <LoadingButton disabled={!!busy} busy={busy === "device"}>
                Gerätenamen speichern
              </LoadingButton>
            </form>
          </>
        )}
      </AccordionSection>

      {user.role !== "admin" && (
        <AccordionSection title="Anmelde-QR-Code" description="Ohne Passwort anmelden, per Kamera" meta="QR">
          {session?.user.twoFactorEnabled ? <p className="muted">2FA ist aktiv. Melde weitere Geräte mit Passwort und Authenticator-Code an.</p> : <QrLoginCard username={user.username} />}
        </AccordionSection>
      )}

      <AccordionSection title="Handy-Widget & Kurzbefehle" description="Per Apple Kurzbefehl oder Android-Widget zählen" meta="API">
        <ApiTokenCard />
      </AccordionSection>

      <AccordionSection title="Zwei-Faktor-Authentifizierung" description="Optional mit einer Authenticator-App absichern" meta="2FA">
        <TwoFactorCard />
      </AccordionSection>

      <AccordionSection title="Passwort ändern" description="Zugang und andere Anmeldungen absichern" meta="Sicherheit">
        <form onSubmit={password}>
          <FloatingLabelInput label="Bisheriges Passwort" name="current" type="password" autoComplete="current-password" required maxLength={128}  />
          <FloatingLabelInput
            label="Neues Passwort"
            name="new"
            type="password"
            value={newPassword}
            onChange={(val) => setNewPassword(val)}
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
          />
          <PasswordStrength value={newPassword} className="mt-1" />
          <LoadingButton disabled={!!busy} busy={busy === "password"}>
            Passwort ändern
          </LoadingButton>
        </form>
      </AccordionSection>

      {/* Support & Problem melden */}
      <AccordionSection
        title="Problem melden / Support"
        description="Diagnosebericht an den Administrator übermitteln"
        meta="Hilfe"
      >
        <p className="muted">
          Übermittelt Systeminformationen (Browser, Verbindungsstatus, anstehende Synchronisierungen) direkt an das Admin-Panel, um Störungen schnell zu beheben.
        </p>

        {supportMsg && (
          <p className="notification" role="status">
            {supportMsg}
          </p>
        )}

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSupportBusy(true);
            setSupportMsg("");
            const res = await sendDiagnosticReport(supportNotes);
            setSupportBusy(false);
            if (res.ok) {
              setSupportMsg("Diagnosebericht erfolgreich gesendet. Der Administrator sieht die Meldung.");
              setSupportNotes("");
            } else {
              setSupportMsg(res.error || "Konnte Diagnosebericht nicht senden.");
            }
          }}
        >
          <label htmlFor="support-notes">
            Problembeschreibung (optional)
            <textarea
              id="support-notes"
              rows={4}
              value={supportNotes}
              onChange={(event) => setSupportNotes(event.target.value)}
              maxLength={500}
              placeholder="Was ist passiert? Wann? Auf welchem Gerät?"
            />
          </label>
          <LoadingButton
            className="secondary-button"
            disabled={supportBusy}
            busy={supportBusy}
          >
            Diagnosebericht senden
          </LoadingButton>
        </form>
      </AccordionSection>
    </main>
  );
}
