"use client";
import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";
import { useConvex, useConvexAuth, useConvexConnectionState } from "convex/react";
import { api } from "@/convex/_generated/api";
import { LOCAL_CHANGE, SyncError, synchronize } from "./sync";
import { getDevice } from "./device";
import { readRecords } from "./sync-state";
import { errorMessage } from "./errors";
export type SyncState = { state: "connecting" | "synced" | "pending" | "retrying" | "offline" | "conflict"; pending: number; message?: string };
// A rejected upload (e.g. many devices writing the same day at once) is retried without waiting for the next click.
const RETRY_DELAYS = [2_000, 5_000, 10_000, 30_000, 60_000];
function useQueueSync(onChange: () => void): SyncState {
  const client = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const connection = useConvexConnectionState();
  const [status, setStatus] = useState<SyncState>({ state: "connecting", pending: 0 });
  useEffect(() => {
    if (!isAuthenticated) return;
    let stopped = false, running = false, again = false, attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const pendingCount = () => readRecords(localStorage).filter((r) => !r.synced).length;
    const safePendingCount = () => { try { return pendingCount(); } catch { return 0; } };
    async function flush() {
      if (stopped) return;
      if (running) { again = true; return; }
      running = true;
      clearTimeout(retryTimer);
      try {
        const pending = pendingCount();
        setStatus({ state: pending ? "pending" : "synced", pending });
        // Do not put new Convex mutations into its memory queue while offline.
        if (!navigator.onLine || !connection.isWebSocketConnected) { setStatus({ state: "offline", pending }); return; }
        if (pending) {
          const actor = await client.query(api.auth.currentUser, {});
          const left = await synchronize(localStorage, (records) => client.mutation(api.visits.upload, { records }), getDevice(), actor?.id);
          if (!stopped) setStatus({ state: left ? "pending" : "synced", pending: left });
        }
        attempts = 0;
      } catch (error) {
        const message = errorMessage(error, "");
        if (stopped) return;
        if (error instanceof SyncError || message.includes("anderen Benutzer")) setStatus({ state: "conflict", pending: safePendingCount(), message: message || "Benutzerzugang prüfen" });
        else if (!navigator.onLine) setStatus({ state: "offline", pending: safePendingCount() });
        else {
          const delay = RETRY_DELAYS[Math.min(attempts++, RETRY_DELAYS.length - 1)];
          setStatus({ state: "retrying", pending: safePendingCount(), message: `Übertragung fehlgeschlagen, neuer Versuch in ${delay / 1000} s` });
          retryTimer = setTimeout(() => void flush(), delay);
        }
      } finally {
        running = false;
        if (!stopped) onChange();
        if (again && !stopped) { again = false; void flush(); }
      }
    }
    const changed = () => { onChange(); void flush(); };
    const visible = () => { if (document.visibilityState === "visible") changed(); };
    const storage = (event: StorageEvent) => { if (event.key === null || event.key.startsWith("chaxterlog:event:")) changed(); };
    void flush();
    window.addEventListener(LOCAL_CHANGE, changed);
    window.addEventListener("online", changed);
    window.addEventListener("focus", changed);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visible);
    return () => { stopped = true; clearTimeout(retryTimer); window.removeEventListener(LOCAL_CHANGE, changed); window.removeEventListener("online", changed); window.removeEventListener("focus", changed); window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", visible); };
  }, [client, isAuthenticated, connection.isWebSocketConnected, onChange]);
  return status;
}

const QUEUE_CHANGE = "chaxterlog:queue-ack";
const SyncContext = createContext<SyncState>({ state: "connecting", pending: 0 });
export function VisitSyncProvider({ children }: { children: React.ReactNode }) {
  const changed = useCallback(() => window.dispatchEvent(new Event(QUEUE_CHANGE)), []);
  const status = useQueueSync(changed);
  return createElement(SyncContext.Provider, { value: status }, children);
}
export function useVisitSync(onChange: () => void): SyncState {
  const status = useContext(SyncContext);
  useEffect(() => {
    window.addEventListener(QUEUE_CHANGE, onChange);
    window.addEventListener(LOCAL_CHANGE, onChange);
    return () => { window.removeEventListener(QUEUE_CHANGE, onChange); window.removeEventListener(LOCAL_CHANGE, onChange); };
  }, [onChange]);
  return status;
}
