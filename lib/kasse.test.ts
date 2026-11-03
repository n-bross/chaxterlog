import assert from "node:assert/strict";
import test from "node:test";
import { removal, buttonItem, cartAdd, cartRemove, cartTotals, changeBreakdown, countedTotal, customItem, validateButtons, DEFAULT_BUTTONS, EMPTY_KEYPAD, keypadPress, keypadTotal, nextSeq, parseEuro, pendingOps, pushOps, readOps, saveOp, sessionView, StorageFailure, type KasseOp, type OpAck } from "./kasse.ts";

function storageMock(failWrites = false): Storage {
  const data = new Map<string, string>();
  return { get length() { return data.size; }, key: (i) => [...data.keys()][i] ?? null, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { if (failWrites && key.includes(":op:")) throw new Error("QuotaExceededError"); data.set(key, value); }, removeItem: (key) => { data.delete(key); }, clear: () => data.clear() };
}
let n = 0;
const uuid = () => `e3d907b1-05aa-4eac-89a0-${String(++n).padStart(12, "0")}`;
const device = { deviceId: uuid(), deviceName: "Kasse 1" };
const session = uuid();
const op = <T extends KasseOp["type"]>(type: T, extra: object, s: Storage): KasseOp => ({ id: uuid(), sessionId: session, at: new Date().toISOString(), seq: nextSeq(s), ...device, type, ...extra }) as KasseOp;
const okServer = (sent: KasseOp[][]) => async (ops: KasseOp[]): Promise<OpAck[]> => { sent.push(ops); return ops.map((o) => ({ id: o.id, status: "ok" })); };

test("keypad shifts digits in like a till and adds parts", () => {
  let k = EMPTY_KEYPAD;
  for (const key of ["2", "5", "0", "plus", "1", "00"]) k = keypadPress(k, key);
  assert.equal(keypadTotal(k), 350);
  k = keypadPress(k, "back"); k = keypadPress(k, "back"); k = keypadPress(k, "back");
  assert.equal(keypadTotal(k), 250, "backspace steps back into the previous part");
  assert.equal(keypadTotal(keypadPress(k, "clear")), 0);
});

test("drink buttons add 0,50 € deposit for the customer but only the price goes into the till", () => {
  const drink = { id: "g", label: "Getränk", priceCents: 100, pfand: true }, coin = { id: "c", label: "0,20 €", priceCents: 20, pfand: false };
  let cart = cartAdd(cartAdd(cartAdd([], buttonItem(drink)), buttonItem(drink)), buttonItem(coin));
  assert.equal(cart.length, 2, "same button twice is one line with count 2");
  assert.deepEqual(cartTotals(cart, 500), { till: 220, deposit: 100, customerPays: 320, change: 180 });
  cart = cartAdd(cartRemove(cart, "btn:g"), customItem(80));
  assert.deepEqual(cartTotals(cart), { till: 200, deposit: 50, customerPays: 250, change: null });
});

test("button settings are validated", () => {
  assert.equal(validateButtons(DEFAULT_BUTTONS), null);
  assert.match(validateButtons([{ id: "a", label: "", priceCents: 100, pfand: false }])!, /Namen/);
  assert.match(validateButtons([{ id: "a", label: "X", priceCents: 0, pfand: false }])!, /Preis/);
  assert.match(validateButtons([{ id: "a", label: "X", priceCents: 1, pfand: false }, { id: "a", label: "Y", priceCents: 1, pfand: false }])!, /ID/);
});

test("change and counting helpers", () => {
  assert.deepEqual(changeBreakdown(1380), [{ cents: 1000, count: 1 }, { cents: 200, count: 1 }, { cents: 100, count: 1 }, { cents: 50, count: 1 }, { cents: 20, count: 1 }, { cents: 10, count: 1 }]);
  assert.equal(countedTotal({ 1000: 2, 50: 3, 1: 4 }), 2154);
  assert.equal(parseEuro("12,5"), 1250); assert.equal(parseEuro("abc"), null); assert.equal(parseEuro("1,234"), null);
});

test("a failed write is reported and never shown as booked", () => {
  const s = storageMock(true);
  assert.throws(() => saveOp(s, op("sale", { amountCents: 100 }, s)), StorageFailure);
  assert.equal(readOps(s).length, 0);
});

test("offline bookings survive failures and are sent once, in order", async () => {
  const s = storageMock();
  saveOp(s, op("open", { floatCents: 5000 }, s));
  for (let i = 1; i <= 120; i++) saveOp(s, op("sale", { amountCents: i }, s));
  await assert.rejects(pushOps(s, async () => { throw new Error("offline"); }));
  assert.equal(pendingOps(s).length, 121, "nothing is lost when sending fails");
  const sent: KasseOp[][] = [];
  assert.equal(await pushOps(s, okServer(sent)), 0);
  assert.deepEqual(sent.map((b) => b.length), [50, 50, 21]);
  assert.equal(sent[0][0].type, "open", "the opening always goes first");
  const seqs = sent.flat().map((o) => o.seq);
  assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b));
  assert.equal(await pushOps(s, okServer(sent)), 0);
  assert.equal(sent.length, 3, "confirmed bookings are not sent again");
});

test("a lost acknowledgement keeps the booking pending", async () => {
  const s = storageMock();
  saveOp(s, op("open", { floatCents: 0 }, s));
  saveOp(s, op("sale", { amountCents: 300 }, s));
  await assert.rejects(pushOps(s, async (ops) => ops.slice(0, 1).map((o) => ({ id: o.id, status: "ok" }))));
  assert.equal(pendingOps(s).length, 1);
});

test("the session view merges server and device without double counting", () => {
  const s = storageMock();
  const open = op("open", { floatCents: 5000 }, s); saveOp(s, open);
  const a = op("sale", { amountCents: 400 }, s), b = op("sale", { amountCents: 250 }, s);
  saveOp(s, a); saveOp(s, b);
  const stornoA1 = op("storno", { saleId: a.id }, s), stornoA2 = op("storno", { saleId: a.id }, s);
  saveOp(s, stornoA1); saveOp(s, stornoA2);
  let view = sessionView(session, readOps(s), null);
  assert.equal(view.netCents, 250, "a sale cancelled twice counts once");
  assert.equal(view.expectedCents, 5250);
  assert.equal(view.unconfirmed, 5);
  // The server already has `a` (and the same booking again from the device must not add up).
  const server = { session: { id: session, status: "open" as const, openedAt: open.at, openedBy: "anna", floatCents: 5000, salesCents: 400, saleCount: 1, stornoCents: 0, stornoCount: 0, lateCount: 0 }, entries: [{ id: a.id, kind: "sale" as const, amountCents: 400, at: a.at, seq: a.seq, username: "anna", deviceName: "Kasse 1", late: false, ignored: false }] };
  view = sessionView(session, readOps(s), server);
  assert.equal(view.netCents, 250);
  assert.equal(view.entries.filter((e) => e.confirmed).length, 1);
  assert.equal(view.checksumOk, true);
  assert.equal(sessionView(session, readOps(s), { ...server, session: { ...server.session, salesCents: 500 } }).checksumOk, false, "a drifting server total is detected");
});

test("closing: everything above the float is taken out and counted", () => {
  assert.deepEqual(removal(12_340, 5000, 7340), { shouldRemove: 7340, difference: 0 });
  assert.deepEqual(removal(12_340, 5000, 7300), { shouldRemove: 7340, difference: -40 });
  assert.deepEqual(removal(12_340, 5000, null), { shouldRemove: 7340, difference: null });
});
