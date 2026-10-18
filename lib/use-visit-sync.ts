"use client";

import { useEffect, useState } from "react";
import { LOCAL_CHANGE, SyncError, synchronize } from "./sync";
import { getDevice } from "./device";
import { readRecords } from "./sync-state";
import { syncDelay } from "./sync-schedule";

export type SyncState = { state: "connecting" | "synced" | "pending" | "offline" | "conflict"; pending: number; message?: string };

export function useVisitSync(onChange: () => void): SyncState {
  const [status, setStatus] = useState<SyncState>({ state: "connecting", pending: 0 });
  useEffect(() => {
    let stopped = false;
    let running = false;
    let again = false;
    let lastActivity = Date.now();
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controllers = new Set<AbortController>();
    const pendingCount = () => readRecords(localStorage).filter((event) => !event.synced).length;
    const schedule = () => {
      clearTimeout(timer);
      if (!stopped) timer = setTimeout(() => { void tick(); }, syncDelay(Date.now() - lastActivity, failures));
    };
    async function tick() {
      if (stopped) return;
      if (document.visibilityState === "hidden") { schedule(); return; }
      if (running) { again = true; return; }
      clearTimeout(timer);
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
        failures = 0;
        if (!stopped) {
          setStatus({ state: left ? "pending" : "synced", pending: left });
          onChange();
        }
      } catch (error) {
        failures++;
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
        else schedule();
      }
    }
    const activity = () => {
      const wasIdle = Date.now() - lastActivity >= 60_000;
      lastActivity = Date.now();
      if (wasIdle && !running) schedule();
    };
    const changed = () => { activity(); onChange(); void tick(); };
    const visible = () => { if (document.visibilityState === "visible") changed(); };
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith("chaxterlog:event:")) changed();
    };
    void tick();
    window.addEventListener("pointerdown", activity, { passive: true });
    window.addEventListener("keydown", activity);
    window.addEventListener(LOCAL_CHANGE, changed);
    window.addEventListener("online", changed);
    window.addEventListener("focus", changed);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", visible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
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
