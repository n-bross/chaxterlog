import type { SyncState } from "@/lib/use-visit-sync";

export default function SyncStatus({ status }: { status: SyncState }) {
  const label = status.state === "conflict" ? status.message ?? "Benutzerzugang prüfen" : status.state === "synced" ? "Synchronisiert" : status.state === "connecting" ? "Verbindung wird hergestellt" : status.state === "pending" ? `${status.pending} Klicks werden synchronisiert` : `Sync nicht erreichbar${status.pending ? ` · ${status.pending} Klicks lokal gespeichert` : " · lokaler Stand"}`;
  return <span className="sync-status" data-state={status.state} role="status" title={label} aria-label={label}>
    <span className="sync-dot" aria-hidden="true" />
    {status.state === "offline" && <span>Offline{status.pending ? ` · ${status.pending} offen` : ""}</span>}
    {status.state === "conflict" && <span>Zugang prüfen</span>}
    {status.state === "pending" && <span>{status.pending} offen</span>}
  </span>;
}
