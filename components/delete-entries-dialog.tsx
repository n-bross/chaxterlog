"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { convex } from "@/lib/convex-client";
import { errorMessage } from "@/lib/errors";
import { dayKey } from "@/lib/tracking";
import { Modal } from "./interior/modal";
import { FloatingLabelInput } from "./interior/floating-label";
import { LoadingButton } from "./interior/loading-button";

type Scope = "day" | "month" | "all";
const monthLabel = (month: string) => new Date(`${month}-15T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC", month: "long", year: "numeric" });
const lastDay = (month: string) => {
  const [year, value] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(year, value, 0)).getUTCDate()).padStart(2, "0")}`;
};
// The last two years, newest first: enough for correcting a wrong account without a free-text month field.
const recentMonths = () => {
  const date = new Date(`${dayKey().slice(0, 7)}-15T12:00:00Z`);
  return Array.from({ length: 24 }, () => { const month = date.toISOString().slice(0, 7); date.setUTCMonth(date.getUTCMonth() - 1); return month; });
};

export default function DeleteEntriesDialog({ user, onClose, onDone }: {
  user: { id: string; username: string } | null;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [scope, setScope] = useState<Scope>("day");
  const [day, setDay] = useState(() => dayKey());
  const [month, setMonth] = useState(() => dayKey().slice(0, 7));
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const range = scope === "day" ? { from: day, to: day } : scope === "month" ? { from: `${month}-01`, to: lastDay(month) } : { from: "2000-01-01", to: "2100-12-31" };
  const what = scope === "day"
    ? `am ${new Date(`${day}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}`
    : scope === "month" ? `im ${monthLabel(month)}` : "insgesamt";

  function close() {
    if (busy) return;
    setPassword(""); setError(""); onClose();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !password || !day) return;
    setBusy(true); setError("");
    try {
      const { deleted } = await convex.action(api.admin.deleteEntries, { userId: user.id, ...range, password });
      setPassword("");
      onDone(deleted ? `${deleted} ${deleted === 1 ? "Eintrag" : "Einträge"} von ${user.username} gelöscht.` : `${user.username} hat ${what} keine Einträge.`);
    } catch (err) {
      setError(errorMessage(err, "Löschen fehlgeschlagen. Bitte Verbindung prüfen."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!user} onClose={close} title={`Einträge von ${user?.username ?? ""} löschen`} maxWidth={460} className="interior-modal" showClose={!busy}
      description="Löscht die Besuche, die dieser Zugang gezählt hat, samt Undo/Redo. Tages-, Monats- und Jahressummen werden angepasst.">
      <form className="modal-form" onSubmit={submit}>
        <div className="scope-choice" role="radiogroup" aria-label="Zeitraum">
          {([["day", "Ein Tag"], ["month", "Ein Monat"], ["all", "Alle Einträge"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={scope === value} className="secondary-button btn-small" aria-pressed={scope === value} onClick={() => setScope(value)}>{label}</button>
          ))}
        </div>
        {scope === "day" && <label>Tag<input type="date" required value={day} max={dayKey()} onChange={(e) => setDay(e.target.value)} /></label>}
        {scope === "month" && (
          <label>Monat
            <select value={month} onChange={(e) => setMonth(e.target.value)}>
              {recentMonths().map((value) => <option key={value} value={value}>{monthLabel(value)}</option>)}
            </select>
          </label>
        )}
        <p className="danger-note">Alle Einträge von <strong>{user?.username}</strong> {what} werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.</p>
        <FloatingLabelInput label="Dein Admin-Passwort zur Bestätigung" name="admin-password" type="password" autoComplete="current-password" required value={password} onChange={setPassword} />
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="modal-actions">
          <div className="modal-buttons">
            <button type="button" className="secondary-button" onClick={close} disabled={busy}>Abbrechen</button>
            <LoadingButton className="danger-button danger-solid" busy={busy} busyLabel="Wird gelöscht …" disabled={!password}>Einträge löschen</LoadingButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
