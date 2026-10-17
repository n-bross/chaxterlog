"use client";

import { useEffect, useState } from "react";
import { LOCAL_CHANGE, SyncError, synchronize } from "./sync";
import { getDevice } from "./device";
import { readRecords } from "./sync-state";

export type SyncState = { state: "connecting" | "synced" | "pending" | "offline" | "conflict"; pending: number; message?: string };

export function useVisitSync(onChange: () => void): SyncState {
  const [status, setStatus] = useState<SyncState>({ state: "connecting", pending: 0 });
  useEffect(() => {
    let stopped = false;
    let running = false;
    let again = false;
    const controllers = new Set<AbortController>();
    const pendingCount = () => readRecords(localStorage).filter((event) => !event.synced).length;
    async function tick() {
      if (stopped || document.visibilityState === "hidden") return;
      if (running) { again = true; return; }
      running = true;
      try {
        const pending = pendingCount();
        if (pending) setStatus({ state: "pending", pending });
        const left = await synchronize(localStorage, async (url, init) => {
          const controller = new AbortController();
          controllers.add(controller);
          const timer = setTimeout(() => controller.abort(), 12_000);
          try {
            const response = await fetch(url, { ...init, signal: controller.signal });
            if (response.status === 401) { window.location.assign("/login"); throw new Error("Login required"); }
            return response;
          }
          finally { clearTimeout(timer); controllers.delete(controller); }
        }, getDevice());
        if (!stopped) {
          setStatus({ state: left ? "pending" : "synced", pending: left });
          onChange();
        }
      } catch (error) {
        if (!stopped) {
          let pending = 0;
          try { pending = pendingCount(); } catch { /* Main page displays storage failures. */ }
          setStatus(error instanceof SyncError && error.status === 409 ? { state: "conflict", pending, message: error.message } : { state: "offline", pending });
          // An upload may have succeeded before a later request failed.
          onChange();
        }
      } finally {
        running = false;
        if (again && !stopped) { again = false; void tick(); }
      }
    }
    const changed = () => { onChange(); void tick(); };
    const visible = () => { if (document.visibilityState === "visible") changed(); };
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith("chaxterlog:event:")) changed();
    };
    void tick();
    const interval = setInterval(() => { void tick(); }, 3_000);
    window.addEventListener(LOCAL_CHANGE, changed);
    window.addEventListener("online", changed);
    window.addEventListener("focus", changed);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearInterval(interval);
      controllers.forEach((controller) => controller.abort());
      window.removeEventListener(LOCAL_CHANGE, changed);
      window.removeEventListener("online", changed);
      window.removeEventListener("focus", changed);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [onChange]);
  return status;
}
