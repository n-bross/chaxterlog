"use client";
import { useCallback, useEffect, useState } from "react";
import QrCode, { qrSvg } from "./qr-code";
import { LoadingButton } from "./interior/loading-button";
import { qrUrl } from "@/lib/qr-login";

type Status = { active: boolean; createdAt: string | null; expiresAt: string | null };
const date = (value: string) => new Date(value).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" });

// Renders the QR code into a PNG so it can be saved to the photo library or printed.
async function downloadPng(text: string, username: string) {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(text))}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 720;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, 720, 720);
  const link = document.createElement("a");
  link.download = `chaxterlog-anmeldung-${username}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

export default function QrLoginCard({ username }: { username: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "revoke" | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/qr-login/status");
      setStatus(response.ok ? await response.json() : null);
    } catch { setStatus(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (status?.active && !window.confirm("Einen neuen QR-Code erstellen? Der bisherige funktioniert danach nicht mehr.")) return;
    setBusy("create"); setError("");
    try {
      const response = await fetch("/api/auth/qr-login/create", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error();
      const { token } = await response.json();
      setUrl(qrUrl(token));
      await load();
    } catch { setError("QR-Code konnte nicht erstellt werden. Bitte Verbindung prüfen."); }
    finally { setBusy(null); }
  }

  async function revoke() {
    if (!window.confirm("QR-Code löschen? Anmelden geht danach nur noch mit Passwort.")) return;
    setBusy("revoke"); setError("");
    try {
      const response = await fetch("/api/auth/qr-login/revoke", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error();
      setUrl(null);
      await load();
    } catch { setError("QR-Code konnte nicht gelöscht werden."); }
    finally { setBusy(null); }
  }

  return (
    <div className="qr-login">
      <p className="muted">
        Mit dem QR-Code meldest du dich ohne Passwort an: auf der Anmeldeseite „Mit QR-Code anmelden“ tippen oder den Code mit der Kamera scannen.
        Behandle ihn wie einen Schlüssel und gib ihn nicht weiter.
      </p>
      {url ? (
        <div className="qr-result">
          <QrCode text={url} label={`Anmelde-QR-Code für ${username}`} />
          <p className="qr-hint">Jetzt speichern oder ausdrucken. Aus Sicherheitsgründen lässt er sich später nicht noch einmal anzeigen, nur neu erstellen.</p>
          <div className="button-row">
            <button type="button" className="primary-button" onClick={() => void downloadPng(url, username)}>Als Bild speichern</button>
            <button type="button" className="secondary-button" onClick={() => setUrl(null)}>Fertig</button>
          </div>
        </div>
      ) : (
        <div className="qr-status">
          <span className={`status-pill ${status?.active ? "active" : ""}`}>{status?.active ? "QR-Code aktiv" : "Kein QR-Code"}</span>
          {status?.active && status.createdAt && status.expiresAt && <span className="muted">Erstellt am {date(status.createdAt)}, gültig bis {date(status.expiresAt)}</span>}
        </div>
      )}
      {error && <p role="alert" className="error-message">{error}</p>}
      {!url && (
        <div className="button-row">
          <LoadingButton className="primary-button" type="button" onClick={create} busy={busy === "create"} busyLabel="Wird erstellt …" disabled={!!busy}>
            {status?.active ? "Neuen QR-Code erstellen" : "QR-Code erstellen"}
          </LoadingButton>
          {status?.active && (
            <LoadingButton className="danger-button" type="button" onClick={revoke} busy={busy === "revoke"} busyLabel="Wird gelöscht …" disabled={!!busy}>QR-Code löschen</LoadingButton>
          )}
        </div>
      )}
    </div>
  );
}
