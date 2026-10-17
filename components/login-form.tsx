"use client";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
import ChaxterLogo from "./chaxter-logo";

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
        const response = await fetch("/api/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Einrichtung fehlgeschlagen.");
        history.replaceState(null, "", "/einrichten");
      }
      const result = await authClient.signIn.username({ username, password });
      if (result.error)
        throw new Error(
          setup
            ? "Admin ist eingerichtet. Bitte über /login anmelden."
            : "Anmeldung fehlgeschlagen. Zugangsdaten prüfen oder später erneut versuchen."
        );
      window.location.assign(setup ? "/admin" : "/");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Verbindung fehlgeschlagen.");
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
          <label>
            Benutzername
            <input
              name="username"
              autoComplete="username"
              required={!setup}
              defaultValue={setup ? "admin" : ""}
              disabled={setup}
              autoCapitalize="none"
              spellCheck={false}
              maxLength={30}
            />
          </label>
          <label>
            {setup ? "Neues Passwort" : "Passwort"}
            <input
              name="password"
              type="password"
              autoComplete={setup ? "new-password" : "current-password"}
              required
              minLength={setup ? 10 : undefined}
              maxLength={128}
            />
          </label>
          {setup && (
            <>
              <label>
                Passwort wiederholen
                <input
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  maxLength={128}
                />
              </label>
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
          <button className="primary-button" disabled={busy}>
            {busy ? "Bitte warten …" : setup ? "Admin-Zugang erstellen" : "Anmelden"}
          </button>
        </form>
      </div>
    </main>
  );
}
