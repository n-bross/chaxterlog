/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, components } from "./_generated/api";
import schema from "./schema";
import authSchema from "./betterAuth/schema";
import { netFromEntries, type KasseOp } from "../lib/kasse";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./betterAuth/**"]);
const authModules = import.meta.glob("./betterAuth/**/*.ts");
function setup() {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", authSchema, authModules);
  return t;
}
async function signIn(t: ReturnType<typeof setup>, username: string, role: "admin" | "user" = "user") {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: username, username, email: `${username}@chaxter.invalid`, emailVerified: false, role, banned: false, createdAt: now, updatedAt: now } } });
  const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: "session", data: { userId: user._id, token: crypto.randomUUID(), expiresAt: now + 86_400_000, createdAt: now, updatedAt: now } } });
  return t.withIdentity({ subject: user._id, sessionId: session._id });
}

let seq = 1;
const deviceId = crypto.randomUUID();
const make = (sessionId: string) => ({
  open: (floatCents: number): KasseOp => ({ type: "open", id: crypto.randomUUID(), sessionId, at: new Date().toISOString(), seq: seq++, deviceId, deviceName: "Kasse", floatCents }),
  sale: (amountCents: number): KasseOp => ({ type: "sale", id: crypto.randomUUID(), sessionId, at: new Date().toISOString(), seq: seq++, deviceId, deviceName: "Kasse", amountCents }),
  storno: (saleId: string): KasseOp => ({ type: "storno", id: crypto.randomUUID(), sessionId, at: new Date().toISOString(), seq: seq++, deviceId, deviceName: "Kasse", saleId }),
  close: (countedCents: number): KasseOp => ({ type: "close", id: crypto.randomUUID(), sessionId, at: new Date().toISOString(), seq: seq++, deviceId, deviceName: "Kasse", countedCents }),
});

describe("Kasse", () => {
  test("ohne Anmeldung wird nichts gebucht", async () => {
    const t = setup();
    await expect(t.mutation(api.kasse.sync, { ops: [] })).rejects.toThrow("Anmeldung erforderlich");
    await expect(t.query(api.kasse.overview, {})).rejects.toThrow("Anmeldung erforderlich");
  });

  test("wiederholtes Senden bucht nie doppelt", async () => {
    const t = setup(), anna = await signIn(t, "anna");
    const id = crypto.randomUUID(), k = make(id);
    const ops = [k.open(5000), k.sale(450), k.sale(300)];
    expect((await anna.mutation(api.kasse.sync, { ops })).map((a) => a.status)).toEqual(["ok", "ok", "ok"]);
    // Acknowledgement lost: the device sends the same batch again, twice.
    expect((await anna.mutation(api.kasse.sync, { ops })).map((a) => a.status)).toEqual(["duplicate", "duplicate", "duplicate"]);
    await anna.mutation(api.kasse.sync, { ops: [ops[2]] });
    const view = await anna.query(api.kasse.session, { id });
    expect(view.entries).toHaveLength(2);
    expect(view.session?.salesCents).toBe(750);
    expect(netFromEntries(view.entries)).toBe(750);
  });

  test("Storno zählt einmal, auch doppelt von zwei Geräten", async () => {
    const t = setup(), anna = await signIn(t, "anna"), ben = await signIn(t, "ben");
    const id = crypto.randomUUID(), k = make(id);
    const sale = k.sale(400);
    await anna.mutation(api.kasse.sync, { ops: [k.open(0), sale, k.sale(250)] });
    expect((await anna.mutation(api.kasse.sync, { ops: [k.storno(sale.id)] }))[0].status).toBe("ok");
    expect((await ben.mutation(api.kasse.sync, { ops: [k.storno(sale.id)] }))[0].status).toBe("ignored");
    const view = await anna.query(api.kasse.session, { id });
    expect(view.session?.stornoCents).toBe(400);
    expect(view.session!.salesCents - view.session!.stornoCents).toBe(netFromEntries(view.entries));
    expect(netFromEntries(view.entries)).toBe(250);
  });

  test("Abschluss speichert Soll, Ist und nachträgliche Buchungen werden markiert", async () => {
    const t = setup(), anna = await signIn(t, "anna");
    const id = crypto.randomUUID(), k = make(id);
    const close = k.close(6400);
    await anna.mutation(api.kasse.sync, { ops: [k.open(5000), k.sale(1000), k.sale(500), close] });
    let overview = await anna.query(api.kasse.overview, {});
    expect(overview.open).toHaveLength(0);
    expect(overview.closed[0]).toMatchObject({ id, status: "closed", expectedCents: 6500, countedCents: 6400, closedBy: "anna" });
    expect((await anna.mutation(api.kasse.sync, { ops: [close] }))[0].status).toBe("duplicate");
    expect((await anna.mutation(api.kasse.sync, { ops: [k.close(1)] }))[0].status).toBe("ignored");
    // An offline second device delivers a sale after the closing: kept, not lost, but flagged.
    expect((await anna.mutation(api.kasse.sync, { ops: [k.sale(200)] }))[0].status).toBe("late");
    overview = await anna.query(api.kasse.overview, {});
    expect(overview.closed[0]).toMatchObject({ lateCount: 1, salesCents: 1700, expectedCents: 6500 });
  });

  test("ungültige Beträge und fehlende Eröffnung werden abgewiesen", async () => {
    const t = setup(), anna = await signIn(t, "anna");
    const k = make(crypto.randomUUID());
    await expect(anna.mutation(api.kasse.sync, { ops: [k.open(0), k.sale(0)] })).rejects.toThrow("Ungültiger Betrag");
    await expect(anna.mutation(api.kasse.sync, { ops: [k.open(0), k.sale(12.5)] })).rejects.toThrow("Ungültiger Betrag");
    await expect(anna.mutation(api.kasse.sync, { ops: [make(crypto.randomUUID()).sale(100)] })).rejects.toThrow("Eröffnung fehlt");
    // A rejected batch writes nothing, so the device can fix and resend it.
    expect((await anna.query(api.kasse.overview, {})).open).toHaveLength(0);
  });

  test("Knöpfe: Standard für alle, ändern nur als Admin", async () => {
    const t = setup(), anna = await signIn(t, "anna"), chef = await signIn(t, "chef", "admin");
    expect((await anna.query(api.kasse.buttons, {})).length).toBeGreaterThan(0);
    const mine = [{ id: "cola", label: " Cola ", priceCents: 200, pfand: "getraenk" as const }];
    await expect(anna.mutation(api.kasse.saveButtons, { buttons: mine })).rejects.toThrow("Admin erforderlich");
    await expect(chef.mutation(api.kasse.saveButtons, { buttons: [{ ...mine[0], priceCents: 0 }] })).rejects.toThrow("Preis");
    await chef.mutation(api.kasse.saveButtons, { buttons: mine });
    expect(await anna.query(api.kasse.buttons, {})).toEqual([{ id: "cola", label: "Cola", priceCents: 200, pfand: "getraenk" }]);
  });
});
