"use client";
import { readRecords } from "./sync-state";

export const qrUrl = (token: string) => `${window.location.origin}/login/qr#${token}`;

// Accepts the scanned URL (".../login/qr#<token>") or a bare token.
export function tokenFromQr(text: string): string | null {
  const value = text.trim();
  const fragment = value.includes("#") ? value.slice(value.indexOf("#") + 1) : value;
  return /^[A-Za-z0-9_-]{6,64}\.[A-Za-z0-9_-]{20,100}$/.test(fragment) ? fragment : null;
}

export async function signInWithQr(token: string) {
  // Same rule as the password login: open clicks of another person are never re-attributed silently.
  const userId = token.split(".")[0];
  const pending = readRecords(localStorage).filter((record) => !record.synced);
  if (pending.some((record) => (!record.legacy && !record.baseline && record.userId && record.userId !== userId) || record.corrections?.some((c) => c.userId && c.userId !== userId))) {
    throw new Error("Offene Klicks gehören zu einem anderen Benutzer. Bitte zuerst mit diesem Konto anmelden und synchronisieren.");
  }
  const response = await fetch("/api/auth/qr-login/sign-in", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
  if (response.status === 429) throw new Error("Zu viele Anmeldeversuche. Bitte eine Minute warten.");
  if (!response.ok) throw new Error("Dieser QR-Code ist ungültig oder abgelaufen. Bitte mit Passwort anmelden und im Konto einen neuen QR-Code erstellen.");
}
