"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { readRecords } from "@/lib/sync-state";
import { CHECK_UPDATE, UPDATE_ATTEMPT, updateBlock, type UpdateBlock } from "@/lib/app-update";

const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION;
export default function AppUpdater() {
  const pathname = usePathname();
  const activity = useRef(Date.now());
  const dirty = useRef(new Set<HTMLFormElement>());
  const [available, setAvailable] = useState(false);
  const [blocked, setBlocked] = useState<UpdateBlock>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { dirty.current.clear(); activity.current = Date.now(); }, [pathname]);
  useEffect(() => {
    let stopped = false, checking = false, loading = false;
    let target: string | null = null;
    let lastReloadCheck = 0;
    const controllers = new Set<AbortController>();
    async function latestVersion(): Promise<string> {
      const controller = new AbortController(); controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetch("/api/version", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Version unavailable");
        const data = await response.json();
        if (typeof data.version !== "string" || !data.version || data.version.length > 200) throw new Error("Invalid version");
        return data.version;
      } finally { clearTimeout(timer); controllers.delete(controller); }
    }
    function reason(version: string, manual = false): UpdateBlock {
      const pending = readRecords(localStorage).filter((event) => !event.synced).length;
      let attempt: { version?: string; at?: number } = {};
      try { attempt = JSON.parse(sessionStorage.getItem(UPDATE_ATTEMPT) ?? "{}"); } catch { /* Fresh attempt. */ }
      const active = document.activeElement;
      const editing = active instanceof HTMLElement && (active.matches("input,textarea,select") || active.isContentEditable);
      return updateBlock({ online: navigator.onLine, pending, formDirty: dirty.current.size > 0, editing,
        idleMs: manual ? 10_000 : Date.now() - activity.current, version,
        attemptedVersion: manual ? undefined : attempt.version, attemptedAt: attempt.at, now: Date.now() });
    }
    async function reloadIfSafe(manual = false) {
      if (!target || stopped || loading || document.visibilityState !== "visible") return;
      try {
        const block = reason(target, manual); setBlocked(block);
        if (block) return;
        if (!manual && Date.now() - lastReloadCheck < 10_000) return;
        lastReloadCheck = Date.now(); loading = true;
        // Confirm connectivity and the latest deployment immediately before navigation.
        const version = await latestVersion();
        if (stopped || version === currentVersion || reason(version, manual)) return;
        sessionStorage.setItem(UPDATE_ATTEMPT, JSON.stringify({ version, at: Date.now() }));
        window.location.reload();
      } catch { /* Stay usable on the current page; retry later without losing local data. */ }
      finally { loading = false; }
    }
    async function check(manual = false) {
      if (stopped || checking || document.visibilityState !== "visible") return;
      checking = true;
      try {
        const version = await latestVersion();
        if (stopped) return;
        target = version !== currentVersion ? version : null;
        setAvailable(!!target);
        if (!target) { if (manual) setNotice("Die App ist auf dem neuesten Stand."); return; }
        setNotice("");
        await reloadIfSafe(manual);
      } catch { if (!stopped && manual) setNotice("Update-Prüfung nicht möglich. Bitte Verbindung prüfen."); }
      finally { checking = false; }
    }
    const interacted = () => { activity.current = Date.now(); };
    const edited = (event: Event) => {
      if (event.target instanceof HTMLElement) {
        const form = event.target.closest("form");
        if (form) dirty.current.add(form);
      }
    };
    const reset = (event: Event) => { if (event.target instanceof HTMLFormElement) dirty.current.delete(event.target); };
    const foreground = () => { if (document.visibilityState === "visible") void check(); };
    const manual = () => { void check(true); };
    void check();
    const checkTimer = setInterval(() => { void check(); }, 60_000);
    const idleTimer = setInterval(() => { void reloadIfSafe(); }, 1_000);
    window.addEventListener("focus", foreground);
    window.addEventListener("online", foreground);
    window.addEventListener("pageshow", foreground);
    window.addEventListener(CHECK_UPDATE, manual);
    document.addEventListener("visibilitychange", foreground);
    document.addEventListener("pointerdown", interacted, true);
    document.addEventListener("keydown", interacted, true);
    document.addEventListener("input", edited, true);
    document.addEventListener("change", edited, true);
    document.addEventListener("reset", reset, true);
    return () => {
      stopped = true; clearInterval(checkTimer); clearInterval(idleTimer);
      controllers.forEach((controller) => controller.abort());
      window.removeEventListener("focus", foreground);
      window.removeEventListener("online", foreground);
      window.removeEventListener("pageshow", foreground);
      window.removeEventListener(CHECK_UPDATE, manual);
      document.removeEventListener("visibilitychange", foreground);
      document.removeEventListener("pointerdown", interacted, true);
      document.removeEventListener("keydown", interacted, true);
      document.removeEventListener("input", edited, true);
      document.removeEventListener("change", edited, true);
      document.removeEventListener("reset", reset, true);
    };
  }, []);
  if (!available && !notice) return null;
  const detail = blocked === "pending" ? "Nach dem Synchronisieren der offenen Klicks." : blocked === "form" ? "Nach Abschluss deiner Eingabe." : blocked === "offline" ? "Sobald eine Verbindung besteht." : blocked === "cooldown" ? "Automatisches Laden wird später erneut versucht." : "Wird in einer kurzen Bedienpause geladen.";
  return <aside className="update-notice" role="status" aria-live="polite">
    <div>{available ? <><strong>Neue App-Version verfügbar</strong><span>{detail}</span></> : notice}</div>
    {available ? <button type="button" disabled={blocked === "pending" || blocked === "form" || blocked === "offline"} onClick={() => window.dispatchEvent(new Event(CHECK_UPDATE))}>Jetzt laden</button> : <button type="button" onClick={() => setNotice("")} aria-label="Hinweis schließen">×</button>}
  </aside>;
}
