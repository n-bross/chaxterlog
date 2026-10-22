"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConvexError } from "convex/values";
import { convex, waitForConnection } from "@/lib/convex-client";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { scriptableWidget } from "@/lib/widget-script";
import { LoadingButton } from "./interior/loading-button";
import { FloatingLabelInput } from "./interior/floating-label";
import { CopyButton } from "./interior/copy-button";

type Token = { id: Id<"apiTokens">; name: string; hint: string; createdAt: number; lastUsedAt: number | null };
const date = (value: number) => new Date(value).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const message = (error: unknown, fallback: string) => error instanceof ConvexError ? String(error.data) : fallback;

export default function ApiTokenCard() {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [created, setCreated] = useState<{ token: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");

  const load = useCallback(async () => {
    try { setTokens(await convex.query(api.apiTokens.list, {})); }
    catch { setError("Tokens konnten nicht geladen werden. Bitte Verbindung prüfen."); }
  }, []);
  useEffect(() => { setOrigin(window.location.origin); void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy("create"); setError("");
    try {
      if (!await waitForConnection()) throw new Error("offline");
      setCreated(await convex.mutation(api.apiTokens.create, { name: String(new FormData(form).get("name")) }));
      form.reset();
      await load();
    } catch (cause) { setError(message(cause, "Token konnte nicht erstellt werden. Bitte Verbindung prüfen.")); }
    finally { setBusy(null); }
  }

  async function revoke(token: Token) {
    if (!window.confirm(`Token „${token.name}“ löschen? Kurzbefehle und Widgets mit diesem Token funktionieren danach nicht mehr.`)) return;
    setBusy(token.id); setError("");
    try {
      await convex.mutation(api.apiTokens.revoke, { id: token.id });
      await load();
    } catch (cause) { setError(message(cause, "Token konnte nicht gelöscht werden.")); }
    finally { setBusy(null); }
  }

  const base = `${origin}/api/v1`;
  return (
    <div className="api-tokens">
      <p className="muted">
        Mit einem persönlichen Token zählst du per Apple Kurzbefehl, Scriptable-Widget oder der Android-App „HTTP Shortcuts“, ohne die App zu öffnen.
        Klicks erscheinen unter deinem Namen und dem Gerätenamen des Tokens. Behandle den Token wie ein Passwort.
      </p>

      {created && (
        <div className="api-token-result">
          <p className="qr-hint">Token für „{created.name}“. Jetzt kopieren: Er wird nur dieses eine Mal angezeigt.</p>
          <code className="api-token-value">{created.token}</code>
          <CopyButton value={created.token} label="Token kopieren" />
          <dl className="api-endpoints">
            <dt>Zählen</dt><dd><code>POST {base}/visit</code> mit <code>{"{\"group\":\"u15\"}"}</code> oder <code>{"{\"group\":\"o15\"}"}</code></dd>
            <dt>Rückgängig</dt><dd><code>POST {base}/undo</code> (dein letzter Klick heute)</dd>
            <dt>Zahlen</dt><dd><code>GET {base}/today</code></dd>
            <dt>Anmeldung</dt><dd>Header <code>Authorization: Bearer &lt;Token&gt;</code></dd>
          </dl>
          <div className="button-row">
            <CopyButton value={scriptableWidget(origin, created.token)} label="Scriptable-Widget kopieren" />
            <button type="button" className="secondary-button" onClick={() => setCreated(null)}>Fertig</button>
          </div>
        </div>
      )}

      {tokens && tokens.length > 0 && (
        <ul className="api-token-list">
          {tokens.map((token) => (
            <li key={token.id}>
              <div>
                <strong>{token.name}</strong> <span className="muted">…{token.hint}</span>
                <span className="muted api-token-meta">Erstellt {date(token.createdAt)} · {token.lastUsedAt ? `zuletzt gezählt ${date(token.lastUsedAt)}` : "noch nicht benutzt"}</span>
              </div>
              <LoadingButton className="danger-button" type="button" onClick={() => void revoke(token)} busy={busy === token.id} busyLabel="Wird gelöscht …" disabled={!!busy}>Löschen</LoadingButton>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="error-message">{error}</p>}

      <form onSubmit={create}>
        <FloatingLabelInput label="Gerät, z. B. „Nicos iPhone“" name="name" required maxLength={40} />
        <LoadingButton disabled={!!busy} busy={busy === "create"} busyLabel="Wird erstellt …">Token erstellen</LoadingButton>
      </form>
    </div>
  );
}
