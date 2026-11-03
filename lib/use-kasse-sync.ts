"use client";
import { useEffect, useState } from "react";
import { useConvex, useConvexAuth, useConvexConnectionState } from "convex/react";
import { api } from "@/convex/_generated/api";
import { KASSE_CHANGE, pendingOps, pushOps } from "./kasse";
import { errorMessage } from "./errors";

export type KasseSyncState = { state: "connecting" | "synced" | "pending" | "retrying" | "offline" | "error"; pending: number; message?: string; lastSyncAt?: number };
const RETRY_DELAYS = [2_000, 5_000, 10_000, 30_000];
// Safety net: even if every event is missed, the queue is retried this often.
const HEARTBEAT_MS = 15_000;

export function useKasseSync(onChange: () => void): KasseSyncState {
  const client = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const connection = useConvexConnectionState();
  const [status, setStatus] = useState<KasseSyncState>({ state: "connecting", pending: 0 });
  useEffect(() => {
    if (!isAuthenticated) return;
    let stopped = false, running = false, again = false, attempts = 0, lastSyncAt: number | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const count = () => { try { return pendingOps(localStorage).length; } catch { return 0; } };
    async function flush() {
      if (stopped) return;
      if (running) { again = true; return; }
      running = true; clearTimeout(retry);
      try {
        const pending = count();
        // Never hand operations to the Convex client while offline: they would only wait in its memory.
        if (!navigator.onLine || !connection.isWebSocketConnected) { setStatus({ state: "offline", pending, lastSyncAt }); return; }
        if (pending) {
          setStatus({ state: "pending", pending, lastSyncAt });
          await pushOps(localStorage, (ops) => client.mutation(api.kasse.sync, { ops }));
          lastSyncAt = Date.now();
        }
        attempts = 0;
        if (!stopped) setStatus({ state: count() ? "pending" : "synced", pending: count(), lastSyncAt });
      } catch (error) {
        if (stopped) return;
        const delay = RETRY_DELAYS[Math.min(attempts++, RETRY_DELAYS.length - 1)];
        const message = errorMessage(error, "Übertragung fehlgeschlagen");
        // Server-side rejections need a person to look; network errors just retry.
        setStatus({ state: navigator.onLine ? (attempts > 3 ? "error" : "retrying") : "offline", pending: count(), message, lastSyncAt });
        retry = setTimeout(() => void flush(), delay);
      } finally {
        running = false;
        if (!stopped) onChange();
        if (again && !stopped) { again = false; void flush(); }
      }
    }
    const changed = () => { onChange(); void flush(); };
    const visible = () => { if (document.visibilityState === "visible") changed(); };
    const storage = (event: StorageEvent) => { if (event.key === null || event.key.startsWith("chaxterkasse:")) changed(); };
    const heartbeat = setInterval(() => { if (count()) void flush(); }, HEARTBEAT_MS);
    void flush();
    window.addEventListener(KASSE_CHANGE, changed);
    window.addEventListener("online", changed);
    window.addEventListener("offline", changed);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true; clearTimeout(retry); clearInterval(heartbeat);
      window.removeEventListener(KASSE_CHANGE, changed);
      window.removeEventListener("online", changed);
      window.removeEventListener("offline", changed);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [client, isAuthenticated, connection.isWebSocketConnected, onChange]);
  return status;
}
