"use client";
import { errorMessage } from "@/lib/errors";
import { useState, type FormEvent } from "react";
import { convex } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";
import { readRecords } from "@/lib/sync-state";
import { authClient } from "@/lib/auth-client";
import { FloatingLabelInput } from "./interior/floating-label";
import ChaxterLogo from "./chaxter-logo";
import { LoadingButton } from "./interior/loading-button";
import { OtpInput } from "./interior/otp-input";
import QrScanner from "./qr-scanner";

export default function LoginForm({ setup = false }: { setup?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secondFactor, setSecondFactor] = useState(false);
  const [backup, setBackup] = useState(false);
  const [scanning, setScanning] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const username = setup ? "admin" : String(form.get("username")).trim().toLowerCase();
    const password = String(form.get("password"));
    try {
      if (setup) {
        if (password !== form.get("confirm")) throw new Error("Die Passwörter stimmen nicht überein.");
        const token = window.location.hash.slice(1);
        await convex.mutation(api.setup.complete, { token, password });
        history.replaceState(null, "", "/einrichten");
      }
      const pending = readRecords(localStorage).filter((r) => !r.synced);
      if (pending.some((r) => (!r.legacy && !r.baseline && r.username && r.username !== username) || r.corrections?.some((c) => c.username && c.username !== username))) throw new Error("Offene Klicks gehören zu einem anderen Benutzer. Bitte zuerst mit diesem Konto anmelden und synchronisieren.");
      const result = await authClient.signIn.username({ username, password });
      if (result.error)
        throw new Error(
          setup
            ? "Admin ist eingerichtet. Bitte über /login anmelden."
            : result.error.status === 429
              ? "Zu viele Anmeldeversuche. Bitte eine Minute warten und dann erneut anmelden."
              : result.error.status === 403 && /BANNED/i.test(`${result.error.code ?? ""} ${result.error.message ?? ""}`)
                ? "Dieser Zugang ist gesperrt. Bitte an die Leitung wenden."
                : "Benutzername oder Passwort stimmt nicht."
        );
      if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
        setSecondFactor(true); return;
      }
      window.location.assign(setup ? "/admin" : "/");
    } catch (error) {
      setError(errorMessage(error, "Verbindung fehlgeschlagen."));
    } finally {
      setBusy(false);
    }
  }

  async function verifySecondFactor(code: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = backup
        ? await authClient.twoFactor.verifyBackupCode({ code })
        : await authClient.twoFactor.verifyTotp({ code });
      if (result.error) throw new Error(result.error.status === 429 ? "Zu viele Versuche. Bitte eine Minute warten." : "Code ungültig oder Anmeldung abgelaufen. Bitte erneut versuchen.");
      window.location.assign("/");
    } catch (e) { setError(errorMessage(e, "Verbindung fehlgeschlagen.")); }
    finally { setBusy(false); }
  }

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo-wrap">
          <ChaxterLogo priority />
        </div>
        <h1>{setup ? "Admin einrichten" : "Anmelden"}</h1>
        <p className="auth-subtitle">{setup ? "Einmalig: Passwort für den Admin-Zugang festlegen." : "Besucherzählung im Schülercafé Grafing"}</p>
        {secondFactor ? <div className="two-factor-card">
          <h2>Anmeldung bestätigen</h2>
          <p className="muted">{backup ? "Gib einen deiner einmal verwendbaren Wiederherstellungscodes ein." : "Gib den sechsstelligen Code aus deiner Authenticator-App ein."}</p>
          {backup ? <form onSubmit={(event) => { event.preventDefault(); void verifySecondFactor(String(new FormData(event.currentTarget).get("code")).trim()); }}>
            <FloatingLabelInput label="Wiederherstellungscode" name="code" autoComplete="off" required disabled={busy} />
            <LoadingButton busy={busy}>Anmelden</LoadingButton>
          </form> : <OtpInput label="Authenticator-Code" autoFocus disabled={busy} onComplete={(code) => void verifySecondFactor(code)} onChange={() => setError("")} status={error ? "error" : "idle"} errorMessage={error} hint="Code eingeben oder einfügen." />}
          {error && backup && <p role="alert" className="error-message">{error}</p>}
          <button type="button" className="secondary-button" disabled={busy} onClick={() => { setBackup(!backup); setError(""); }}>{backup ? "Authenticator-Code verwenden" : "Wiederherstellungscode verwenden"}</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => { setSecondFactor(false); setBackup(false); setError(""); }}>Zurück zur Anmeldung</button>
        </div> : <form onSubmit={submit}>
          <FloatingLabelInput label="Benutzername"
              name="username"
              autoComplete="username"
              required={!setup}
              defaultValue={setup ? "admin" : ""}
              disabled={setup}
              autoCapitalize="none"
              spellCheck={false}
              maxLength={30}
             />
          <FloatingLabelInput label={setup ? "Neues Passwort" : "Passwort"}
              name="password"
              type="password"
              autoComplete={setup ? "new-password" : "current-password"}
              required
              minLength={setup ? 10 : undefined}
              maxLength={128}
             />
          {setup && (
            <>
              <FloatingLabelInput label="Passwort wiederholen"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  maxLength={128}
                 />
              <p className="muted">
                Mindestens 10 Zeichen. Bewahre das Passwort sicher auf; es gibt keine Wiederherstellung per E-Mail.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <LoadingButton busy={busy} busyLabel="Bitte warten …">
            {setup ? "Admin-Zugang erstellen" : "Anmelden"}
          </LoadingButton>
        </form>}
        {!setup && !secondFactor && (
          <>
            <div className="auth-divider" aria-hidden="true"><span>oder</span></div>
            <button type="button" className="secondary-button qr-login-button" onClick={() => setScanning(true)}>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 8h3v3H8zM13 13h3v3h-3zM13 8h3M8 13v3" /></svg>
              Mit QR-Code anmelden
            </button>
            <QrScanner open={scanning} onClose={() => setScanning(false)} />
          </>
        )}
      </div>
    </main>
  );
}
