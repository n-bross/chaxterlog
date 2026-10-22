"use client";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import QrCode from "./qr-code";
import { OtpInput } from "./interior/otp-input";
import { FloatingLabelInput } from "./interior/floating-label";
import { LoadingButton } from "./interior/loading-button";

export default function TwoFactorCard() {
  const { data: session, isPending } = authClient.useSession();
  const enabled = !!session?.user.twoFactorEnabled;
  const [setup, setSetup] = useState<{ totpURI: string; backupCodes: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  async function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const password = String(new FormData(form).get("password"));
    setBusy(true); setError(""); setMessage("");
    try {
      if (enabled) {
        const result = await authClient.twoFactor.disable({ password });
        if (result.error) throw new Error("2FA konnte nicht deaktiviert werden. Bitte Passwort prüfen.");
        setMessage("Zwei-Faktor-Authentifizierung ist deaktiviert.");
      } else {
        const result = await authClient.twoFactor.enable({ password });
        if (result.error || !result.data) throw new Error("Einrichtung fehlgeschlagen. Bitte Passwort prüfen.");
        setSetup(result.data); setSaved(false);
      }
      form.reset();
      await authClient.getSession();
    } catch (e) { setError(e instanceof Error ? e.message : "Verbindung fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  async function verify(code: string) {
    if (busy || !saved) return;
    setBusy(true); setError("");
    try {
      const result = await authClient.twoFactor.verifyTotp({ code });
      if (result.error) throw new Error("Code ungültig. Bitte den aktuellen Code aus der Authenticator-App eingeben.");
      setSetup(null); setSaved(false);
      setMessage("Zwei-Faktor-Authentifizierung ist aktiv.");
      await authClient.getSession();
    } catch (e) { setError(e instanceof Error ? e.message : "Verbindung fehlgeschlagen."); }
    finally { setBusy(false); }
  }

  function downloadCodes() {
    if (!setup) return;
    const url = URL.createObjectURL(new Blob([`ChaxterLog – Wiederherstellungscodes für ${session?.user.username ?? "dein Konto"}\nJeder Code ist einmal verwendbar. Sicher und getrennt vom Gerät aufbewahren.\n\n${setup.backupCodes.join("\n")}\n`], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "chaxterlog-wiederherstellungscodes.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="two-factor-card">
    <p className="muted">{enabled ? "Aktiv: Zusätzlich zum Passwort brauchst du einen Code aus deiner Authenticator-App." : "Schütze dein Konto optional mit Passwort und einem zusätzlichen Code aus einer Authenticator-App. Bei aktiver 2FA ist die Anmeldung per Anmelde-QR-Code gesperrt."}</p>
    {setup ? <>
      <p>1. Diesen QR-Code mit deiner Authenticator-App scannen.</p>
      <QrCode text={setup.totpURI} label="Authenticator für ChaxterLog einrichten" />
      <details><summary>Einrichtungsschlüssel manuell eingeben</summary><code className="two-factor-secret">{new URL(setup.totpURI).searchParams.get("secret")}</code></details>
      <p>2. Wiederherstellungscodes sicher aufbewahren. Damit kannst du dich anmelden, wenn dein Authenticator nicht verfügbar ist.</p>
      <pre className="backup-codes">{setup.backupCodes.join("\n")}</pre>
      <button type="button" className="secondary-button" onClick={downloadCodes}>Wiederherstellungscodes herunterladen</button>
      <label className="two-factor-confirm"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} disabled={busy} />Ich habe die Wiederherstellungscodes sicher aufbewahrt.</label>
      <p>3. Aktuellen sechsstelligen App-Code eingeben, um 2FA zu aktivieren.</p>
      <OtpInput label="Authenticator-Code" disabled={busy || !saved} onComplete={(code) => void verify(code)} onChange={() => setError("")} status={error ? "error" : "idle"} hint="Sechsstelligen Code eingeben oder einfügen." errorMessage={error} />
      <button type="button" className="secondary-button" disabled={busy} onClick={() => { setSetup(null); setError(""); }}>Einrichtung abbrechen</button>
    </> : <form onSubmit={configure}>
      <FloatingLabelInput label="Aktuelles Passwort" name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy || isPending} />
      <LoadingButton busy={busy} disabled={busy || isPending || !session} busyLabel="Bitte warten …">{enabled ? "2FA deaktivieren" : "2FA einrichten"}</LoadingButton>
    </form>}
    {error && !setup && <p role="alert" className="error-message">{error}</p>}
    {message && <p role="status" className="notification">{message}</p>}
  </div>;
}
