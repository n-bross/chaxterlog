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

export default function LoginForm({ setup = false }: { setup?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      window.location.assign(setup ? "/admin" : "/");
    } catch (error) {
      setError(errorMessage(error, "Verbindung fehlgeschlagen."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo-wrap">
          <ChaxterLogo />
        </div>
        <h1>{setup ? "Admin einrichten" : "Anmelden"}</h1>
        <form onSubmit={submit}>
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
        </form>
      </div>
    </main>
  );
}
