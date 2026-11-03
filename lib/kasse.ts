// Kasse: pure logic shared by the page, the sync hook, the Convex functions and the tests.
// Money is always an integer number of cents.

export const PFAND = [
  { key: "getraenk", label: "Getränk", cents: 100 },
  { key: "wasser", label: "Wasser", cents: 50 },
] as const;
export type PfandKey = (typeof PFAND)[number]["key"];
export type PfandCounts = Record<PfandKey, number>;
export const NO_PFAND: PfandCounts = { getraenk: 0, wasser: 0 };

export const MAX_SALE_CENTS = 100_000; // 1.000 € per booking catches a slipped finger
export const MAX_CASH_CENTS = 10_000_000;
export const DENOMINATIONS = [50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
export function formatCents(cents: number) { return euro.format(cents / 100); }
export function formatSigned(cents: number) { return `${cents > 0 ? "+" : cents < 0 ? "−" : "±"}${euro.format(Math.abs(cents) / 100)}`; }
export function denominationLabel(cents: number) { return cents >= 100 ? `${cents / 100} €` : `${cents} ct`; }

/** "4,50" / "4.5" / "4" → 450; anything else → null. */
export function parseEuro(text: string): number | null {
  const value = text.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{0,2})?$/.test(value)) return null;
  const [whole, frac = ""] = value.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

// Cash-register keypad: digits shift in from the right ("2", "5", "0" → 2,50 €). "+" starts a new part.
export type Keypad = { parts: number[]; current: number };
export const EMPTY_KEYPAD: Keypad = { parts: [], current: 0 };
export function keypadPress(state: Keypad, key: string): Keypad {
  if (/^\d$/.test(key) || key === "00") {
    const next = key === "00" ? state.current * 100 : state.current * 10 + Number(key);
    return next > MAX_SALE_CENTS ? state : { ...state, current: next };
  }
  if (key === "back") return state.current ? { ...state, current: Math.floor(state.current / 10) } : state.parts.length ? { parts: state.parts.slice(0, -1), current: state.parts.at(-1)! } : state;
  if (key === "plus") return state.current && keypadTotal(state) < MAX_SALE_CENTS ? { parts: [...state.parts, state.current], current: 0 } : state;
  if (key === "clear") return EMPTY_KEYPAD;
  return state;
}
export function keypadTotal(state: Keypad) { return state.parts.reduce((sum, part) => sum + part, 0) + state.current; }

export function pfandCents(counts: PfandCounts) { return PFAND.reduce((sum, item) => sum + item.cents * counts[item.key], 0); }

/** What the customer pays, what goes into the till, and what goes into / out of the deposit box. */
export function checkout(amountCents: number, pfand: PfandCounts, givenCents?: number | null) {
  const deposit = pfandCents(pfand);
  const customerPays = amountCents + deposit;
  const change = givenCents == null ? null : givenCents - customerPays;
  return { till: amountCents, deposit, customerPays, change };
}

/** Fewest notes and coins for an amount, largest first. */
export function changeBreakdown(cents: number) {
  const result: { cents: number; count: number }[] = [];
  let rest = Math.max(0, Math.round(cents));
  for (const value of DENOMINATIONS) {
    const count = Math.floor(rest / value);
    if (count) { result.push({ cents: value, count }); rest -= count * value; }
  }
  return result;
}
export function countedTotal(counts: Partial<Record<number, number>>) {
  return DENOMINATIONS.reduce((sum, value) => sum + value * Math.max(0, Math.floor(counts[value] ?? 0)), 0);
}

// ─── Operations ────────────────────────────────────────────────
// Every action is an immutable operation with a device-made UUID. The server stores each ID once,
// so any operation can be sent again and again without ever booking twice.

type Base = { id: string; sessionId: string; at: string; seq: number; deviceId: string; deviceName: string };
export type KasseOp =
  | (Base & { type: "open"; floatCents: number })
  | (Base & { type: "sale"; amountCents: number })
  | (Base & { type: "storno"; saleId: string })
  | (Base & { type: "close"; countedCents: number });
export type OpStatus = "ok" | "duplicate" | "ignored" | "late";
export type OpAck = { id: string; status: OpStatus };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const isCents = (value: unknown, max: number, min = 0) => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;

/** Returns an error message, or null when the operation is well-formed. */
export function validateOp(op: KasseOp): string | null {
  if (!isUuid(op.id) || !isUuid(op.sessionId) || !isUuid(op.deviceId)) return "Ungültige ID.";
  if (!Number.isFinite(Date.parse(op.at)) || !Number.isSafeInteger(op.seq) || op.seq < 0) return "Ungültiger Zeitpunkt.";
  if (typeof op.deviceName !== "string" || op.deviceName.length > 60) return "Ungültiger Gerätename.";
  switch (op.type) {
    case "open": return isCents(op.floatCents, MAX_CASH_CENTS) ? null : "Ungültiges Wechselgeld.";
    case "sale": return isCents(op.amountCents, MAX_SALE_CENTS, 1) ? null : "Ungültiger Betrag.";
    case "storno": return isUuid(op.saleId) ? null : "Ungültige Stornierung.";
    case "close": return isCents(op.countedCents, MAX_CASH_CENTS) ? null : "Ungültiger Kassenbestand.";
  }
}

// ─── Local outbox ──────────────────────────────────────────────
// Each operation is its own localStorage key, written and read back before the UI reports "gebucht".

export const OP_PREFIX = "chaxterkasse:op:v1:";
const SEQ_KEY = "chaxterkasse:seq:v1";
export const CURRENT_KEY = "chaxterkasse:current:v1";
export const KASSE_CHANGE = "chaxterkasse:local-change";
export type StoredOp = { op: KasseOp; synced: boolean; status?: OpStatus; syncedAt?: number };

/** Strictly increasing per device, even if the clock jumps back. */
export function nextSeq(storage: Storage, now = Date.now()) {
  const last = Number(storage.getItem(SEQ_KEY) ?? 0) || 0;
  const seq = Math.max(now, last + 1);
  storage.setItem(SEQ_KEY, String(seq));
  return seq;
}

export class StorageFailure extends Error {}
export function saveOp(storage: Storage, op: KasseOp) {
  const problem = validateOp(op);
  if (problem) throw new Error(problem);
  const key = OP_PREFIX + op.id, value = JSON.stringify({ op, synced: false } satisfies StoredOp);
  if (storage.getItem(key)) throw new Error("Diese Buchung existiert bereits.");
  try { storage.setItem(key, value); } catch { throw new StorageFailure("Speicher des Geräts ist voll – Buchung NICHT gespeichert."); }
  if (storage.getItem(key) !== value) throw new StorageFailure("Buchung konnte nicht gespeichert werden – bitte erneut versuchen.");
}

export function readOps(storage: Storage): StoredOp[] {
  const result: StoredOp[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(OP_PREFIX)) continue;
    try {
      const value = JSON.parse(storage.getItem(key) ?? "null") as StoredOp;
      if (value?.op && typeof value.op.type === "string" && !validateOp(value.op)) result.push(value);
    } catch { /* Leave unreadable keys alone; never delete money data. */ }
  }
  return result.sort((a, b) => a.op.seq - b.op.seq);
}
export const pendingOps = (storage: Storage) => readOps(storage).filter((item) => !item.synced);

export function markSynced(storage: Storage, acks: OpAck[], now = Date.now()) {
  for (const ack of acks) {
    const key = OP_PREFIX + ack.id, raw = storage.getItem(key);
    if (!raw) continue;
    const stored = JSON.parse(raw) as StoredOp;
    storage.setItem(key, JSON.stringify({ ...stored, synced: true, status: ack.status, syncedAt: now } satisfies StoredOp));
  }
}

/** Sends pending operations in device order, in batches. Returns how many are still pending. */
export async function pushOps(storage: Storage, send: (ops: KasseOp[]) => Promise<OpAck[]>, batchSize = 50) {
  const pending = pendingOps(storage).map((item) => item.op);
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const acks = await send(batch);
    // Confirm only what the server named; anything without an acknowledgement stays queued.
    markSynced(storage, acks.filter((ack) => batch.some((op) => op.id === ack.id)));
    if (batch.some((op) => !acks.find((ack) => ack.id === op.id))) throw new Error("Empfangsbestätigung fehlt.");
  }
  return pendingOps(storage).length;
}

/** Drops confirmed operations of sessions that ended long ago. Unconfirmed ones are never removed. */
export function pruneOps(storage: Storage, closedSessionIds: Set<string>, now = Date.now(), keepMs = 30 * 86_400_000) {
  for (const item of readOps(storage)) {
    if (item.synced && closedSessionIds.has(item.op.sessionId) && now - (item.syncedAt ?? now) > keepMs) storage.removeItem(OP_PREFIX + item.op.id);
  }
}

// ─── Session view ──────────────────────────────────────────────
// The page shows the union of what the server confirmed and what this device still holds, keyed by ID.
// An entry gets its check mark only once it appears in the server's live data.

export type ServerEntry = { id: string; kind: "sale" | "storno"; amountCents: number; saleId?: string; at: string; seq: number; username: string; deviceName: string; late: boolean; ignored: boolean };
export type ServerSession = { id: string; status: "open" | "closed"; openedAt: string; openedBy: string; floatCents: number; salesCents: number; saleCount: number; stornoCents: number; stornoCount: number; lateCount: number; closedAt?: string; closedBy?: string; countedCents?: number; expectedCents?: number };
export type ViewEntry = { id: string; kind: "sale" | "storno"; amountCents: number; saleId?: string; at: string; seq: number; who: string; confirmed: boolean; late: boolean };

export function sessionView(sessionId: string, local: StoredOp[], server: { session: ServerSession | null; entries: ServerEntry[] } | null) {
  const entries = new Map<string, ViewEntry>();
  for (const e of server?.entries ?? []) entries.set(e.id, { id: e.id, kind: e.kind, amountCents: e.amountCents, saleId: e.saleId, at: e.at, seq: e.seq, who: e.username, confirmed: true, late: e.late });
  let open: Extract<KasseOp, { type: "open" }> | null = null, close: Extract<KasseOp, { type: "close" }> | null = null;
  for (const { op } of local) {
    if (op.sessionId !== sessionId) continue;
    if (op.type === "open") open = op;
    else if (op.type === "close") close = op;
    else if (!entries.has(op.id)) {
      const amount = op.type === "sale" ? op.amountCents : 0;
      entries.set(op.id, { id: op.id, kind: op.type, amountCents: amount, saleId: op.type === "storno" ? op.saleId : undefined, at: op.at, seq: op.seq, who: "dieses Gerät", confirmed: false, late: false });
    }
  }
  const list = [...entries.values()].sort((a, b) => a.seq - b.seq);
  const sales = new Map(list.filter((e) => e.kind === "sale").map((e) => [e.id, e]));
  // A sale cancelled twice (two devices, or a retried tap) still counts once.
  const cancelled = new Set(list.filter((e) => e.kind === "storno" && e.saleId && sales.has(e.saleId)).map((e) => e.saleId!));
  for (const e of list) if (e.kind === "storno" && e.saleId) e.amountCents = -(sales.get(e.saleId)?.amountCents ?? 0);
  const grossCents = [...sales.values()].reduce((sum, e) => sum + e.amountCents, 0);
  const stornoCents = [...cancelled].reduce((sum, id) => sum + sales.get(id)!.amountCents, 0);
  const session = server?.session ?? null;
  const floatCents = session?.floatCents ?? open?.floatCents ?? 0;
  const netCents = grossCents - stornoCents;
  const unconfirmed = list.filter((e) => !e.confirmed).length + (open && !session ? 1 : 0) + (close && session?.status !== "closed" ? 1 : 0);
  // Independent check: the server's running totals must equal the sum of the entries it returned.
  const serverNet = session ? session.salesCents - session.stornoCents : null;
  const serverEntryNet = server ? netFromEntries(server.entries) : null;
  return {
    entries: list, cancelled, floatCents, grossCents, stornoCents, netCents, expectedCents: floatCents + netCents,
    saleCount: sales.size - cancelled.size, unconfirmed,
    closed: session?.status === "closed" || !!close, closedLocally: close, openedAt: session?.openedAt ?? open?.at ?? null,
    checksumOk: serverNet === null || serverEntryNet === null ? null : serverNet === serverEntryNet,
  };
}
export function netFromEntries(entries: Pick<ServerEntry, "id" | "kind" | "amountCents" | "saleId" | "ignored">[]) {
  const sales = new Map(entries.filter((e) => e.kind === "sale").map((e) => [e.id, e.amountCents]));
  const cancelled = new Set(entries.filter((e) => e.kind === "storno" && !e.ignored && e.saleId && sales.has(e.saleId)).map((e) => e.saleId!));
  let net = 0;
  for (const [id, cents] of sales) if (!cancelled.has(id)) net += cents;
  return net;
}
