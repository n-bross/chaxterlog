/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { ConvexError } from "convex/values";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";
import authSchema from "./betterAuth/schema";
import { redoId } from "../lib/corrections";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./betterAuth/**"]);
const authModules = import.meta.glob("./betterAuth/**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  t.registerComponent("betterAuth", authSchema, authModules);
  return t;
}
type T = ReturnType<typeof setup>;

// Better Auth users and sessions live in the component; requireActor reads both through the identity.
async function signIn(t: T, username: string, role: "admin" | "user" = "user", banned = false) {
  const now = Date.now();
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: username, username, email: `${username}@chaxter.invalid`, emailVerified: false, role, banned, createdAt: now, updatedAt: now } } });
  const session = await t.mutation(components.betterAuth.adapter.create, { input: { model: "session", data: { userId: user._id, token: crypto.randomUUID(), expiresAt: now + 86_400_000, createdAt: now, updatedAt: now } } });
  return { id: user._id as string, as: t.withIdentity({ subject: user._id, sessionId: session._id }) };
}

const at = "2026-10-20T10:15:00.000Z", day = "2026-10-20";
// Readable names for the UUIDs the upload validator requires.
const ids = new Map<string, string>();
const u = (name: string) => { if (!ids.has(name)) ids.set(name, crypto.randomUUID()); return ids.get(name)!; };
const click = (name: string, group: "u15" | "o15", userId: string, extra: Record<string, unknown> = {}) => ({ id: u(name), group, timestamp: at, order: Date.parse(at), cancelled: false, userId, deviceId: u("device"), deviceName: "Kasse", platform: "Test", ...extra });
const undo = (name: string) => ({ id: u(name), kind: "undo" as const, timestamp: at, order: Date.parse(at) + 1 });

describe("Zugriffsschutz", () => {
  test("ohne Anmeldung wird jede Datenfunktion abgewiesen", async () => {
    const t = setup();
    await expect(t.query(api.visits.live, { date: day })).rejects.toThrow("Anmeldung erforderlich");
    await expect(t.mutation(api.visits.upload, { records: [] })).rejects.toThrow("Anmeldung erforderlich");
    await expect(t.query(api.stats.days, { from: day, to: day, paginationOpts: { cursor: null, numItems: 10 } })).rejects.toThrow("Anmeldung erforderlich");
    expect(await t.query(api.auth.currentUser, {})).toBeNull();
  });

  test("Mitarbeiter erhalten Tageswerte, aber keine Admin-Funktionen oder Einzeldaten", async () => {
    const t = setup();
    const staff = await signIn(t, "anna");
    const page = { cursor: null, numItems: 10 };
    await expect(staff.as.query(api.admin.users, { paginationOpts: page })).rejects.toThrow("Admin erforderlich");
    await expect(staff.as.query(api.exports.page, { kind: "visits", from: day, to: day, paginationOpts: page })).rejects.toThrow("Admin erforderlich");
    await expect(staff.as.query(api.exports.page, { kind: "corrections", from: day, to: day, paginationOpts: page })).rejects.toThrow("Admin erforderlich");
    expect((await staff.as.query(api.exports.page, { kind: "daily", from: day, to: day, paginationOpts: page })).page).toEqual([]);
    await expect(staff.as.mutation(api.admin.change, { action: "ban", userId: staff.id })).rejects.toThrow("Admin erforderlich");
  });

  test("gesperrte Benutzer werden trotz gültiger Sitzung abgewiesen", async () => {
    const t = setup();
    const banned = await signIn(t, "ben", "user", true);
    await expect(banned.as.query(api.visits.live, { date: day })).rejects.toThrow("Anmeldung erforderlich");
    expect(await banned.as.query(api.auth.currentUser, {})).toBeNull();
  });
});

describe("Besuche hochladen", () => {
  test("zählt Klicks und dedupliziert wiederholte Uploads derselben UUID", async () => {
    const t = setup();
    const staff = await signIn(t, "anna");
    const records = [click("a", "u15", staff.id), click("b", "o15", staff.id), click("c", "u15", staff.id)];
    await staff.as.mutation(api.visits.upload, { records });
    await staff.as.mutation(api.visits.upload, { records }); // verlorene Bestätigung → erneuter Versand
    const live = await staff.as.query(api.visits.live, { date: day });
    expect([live.u15, live.o15]).toEqual([2, 1]);
    const stats = await staff.as.query(api.stats.days, { from: day, to: day, paginationOpts: { cursor: null, numItems: 10 } });
    expect(stats.page[0].u.reduce((a, b) => a + b, 0)).toBe(2);
  });

  test("eine Stornierung bleibt, auch wenn später ein alter Upload ankommt", async () => {
    const t = setup();
    const staff = await signIn(t, "anna");
    await staff.as.mutation(api.visits.upload, { records: [click("a", "u15", staff.id)] });
    await staff.as.mutation(api.visits.upload, { records: [click("a", "u15", staff.id, { cancelled: true, corrections: [undo("undo-1")] })] });
    const ack = await staff.as.mutation(api.visits.upload, { records: [click("a", "u15", staff.id)] });
    expect(ack[0].cancelled).toBe(true);
    expect((await staff.as.query(api.visits.live, { date: day })).u15).toBe(0);
  });

  test("gleiche Redos von zwei Geräten stellen den Besuch nur einmal wieder her", async () => {
    const t = setup();
    const anna = await signIn(t, "anna"), ben = await signIn(t, "ben");
    await anna.as.mutation(api.visits.upload, { records: [click("a", "o15", anna.id, { cancelled: true, corrections: [undo("undo-1")] })] });
    const redo = (userId: string, action: string) => ({ ...click("a", "o15", userId, { redoOf: u("a"), corrections: [{ id: u(action), kind: "redo", timestamp: at, order: Date.parse(at) + 2 }] }), id: redoId(u("a")) });
    await anna.as.mutation(api.visits.upload, { records: [redo(anna.id, "redo-anna")] });
    await ben.as.mutation(api.visits.upload, { records: [redo(ben.id, "redo-ben")] });
    expect((await anna.as.query(api.visits.live, { date: day })).o15).toBe(1);
  });

  test("Redo ohne stornierten Ursprung wird abgelehnt", async () => {
    const t = setup();
    const staff = await signIn(t, "anna");
    await staff.as.mutation(api.visits.upload, { records: [click("a", "u15", staff.id)] });
    await expect(staff.as.mutation(api.visits.upload, { records: [{ ...click("a", "u15", staff.id, { redoOf: u("a") }), id: redoId(u("a")) }] })).rejects.toThrow("Redo benötigt den stornierten Ursprung");
  });

  test("Klicks eines anderen Benutzers werden nicht übernommen", async () => {
    const t = setup();
    const anna = await signIn(t, "anna"), ben = await signIn(t, "ben");
    await expect(ben.as.mutation(api.visits.upload, { records: [click("a", "u15", anna.id)] })).rejects.toThrow("anderen Benutzer");
  });

  test("zu große oder ungültige Stapel werden abgelehnt", async () => {
    const t = setup();
    const staff = await signIn(t, "anna");
    const many = Array.from({ length: 101 }, (_, i) => click(`many-${i}`, "u15", staff.id));
    await expect(staff.as.mutation(api.visits.upload, { records: many })).rejects.toThrow("Ungültiger Klickstapel");
    await expect(staff.as.mutation(api.visits.upload, { records: [{ id: u("x"), group: "kids" }] })).rejects.toThrow("Ungültiger Klickstapel");
  });
});

describe("Fehlermeldungen und Nachträge", () => {
  test("Meldungen für Benutzer bleiben auch in Produktion lesbar (ConvexError)", async () => {
    const t = setup();
    const anna = await signIn(t, "anna"), ben = await signIn(t, "ben");
    const error = await ben.as.mutation(api.visits.upload, { records: [click("a", "u15", anna.id)] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<string>).data).toContain("anderen Benutzer");
  });

  test("ein Klick für einen früheren Tag zählt für diesen Tag, Undo ebenso", async () => {
    const t = setup();
    const admin = await signIn(t, "admin", "admin"), staff = await signIn(t, "anna");
    const earlier = { timestamp: "2026-10-19T19:15:00.000Z", order: Date.parse("2026-10-20T19:15:00.000Z") };
    await staff.as.mutation(api.visits.upload, { records: [click("past-a", "u15", staff.id, earlier), click("past-b", "o15", staff.id, earlier)] });
    await staff.as.mutation(api.visits.upload, { records: [click("past-b", "o15", staff.id, { ...earlier, cancelled: true, corrections: [undo("past-undo")] })] });
    const page = { cursor: null, numItems: 100 };
    const daily = await admin.as.query(api.exports.page, { kind: "daily", from: "2026-10-19", to: day, paginationOpts: page });
    expect(daily.page).toMatchObject([{ date: "2026-10-19", u15: 1, o15: 0 }]);
    const live = await staff.as.query(api.visits.live, { date: "2026-10-19" });
    expect(live).toMatchObject({ u15: 1, o15: 0 });
  });
});

describe("Admin-Export", () => {
  test("liefert Besuche einschließlich Stornierungen und Tageswerte", async () => {
    const t = setup();
    const admin = await signIn(t, "admin", "admin"), staff = await signIn(t, "anna");
    await staff.as.mutation(api.visits.upload, { records: [click("a", "u15", staff.id), click("b", "o15", staff.id, { cancelled: true, corrections: [undo("undo-1")] })] });
    const page = { cursor: null, numItems: 100 };
    const visits = await admin.as.query(api.exports.page, { kind: "visits", from: day, to: day, paginationOpts: page });
    expect((visits.page as { id: string; cancelled: boolean }[]).map((v) => [v.id, v.cancelled]).sort()).toEqual([[u("a"), false], [u("b"), true]].sort());
    const daily = await admin.as.query(api.exports.page, { kind: "daily", from: day, to: day, paginationOpts: page });
    expect(daily.page).toMatchObject([{ date: day, u15: 1, o15: 0 }]);
  });
});

describe("Einträge eines Mitarbeiters löschen", () => {
  test("entfernt nur seine Besuche im Zeitraum und hält die Tagessummen stimmig", async () => {
    const t = setup();
    const anna = await signIn(t, "anna"), ben = await signIn(t, "ben");
    const admin = await signIn(t, "chef", "admin");
    await expect(anna.as.action(api.admin.deleteEntries, { userId: ben.id, from: day, to: day, password: "x" })).rejects.toThrow("Admin erforderlich");
    await anna.as.mutation(api.visits.upload, { records: [click("a1", "u15", anna.id), click("a2", "o15", anna.id), click("a3", "u15", anna.id, { cancelled: true, corrections: [undo("a3-undo")] })] });
    await ben.as.mutation(api.visits.upload, { records: [click("b1", "u15", ben.id)] });
    const before = await admin.as.query(api.visits.live, { date: day });
    expect([before.u15, before.o15]).toEqual([2, 1]);

    let done = false;
    while (!done) done = (await t.mutation(internal.admin.deleteEntriesBatch, { userId: anna.id, from: day, to: day })).done;

    const after = await admin.as.query(api.visits.live, { date: day });
    expect([after.u15, after.o15]).toEqual([1, 0]);
    expect(after.revision).toBeGreaterThan(before.revision);
    const [stats] = (await admin.as.query(api.stats.days, { from: day, to: day, paginationOpts: { cursor: null, numItems: 10 } })).page;
    expect(stats.u.reduce((a: number, b: number) => a + b, 0)).toBe(1);
    const left = await admin.as.query(api.exports.page, { kind: "visits", from: day, to: day, paginationOpts: { cursor: null, numItems: 10 } });
    expect(left.page.map((v) => ("id" in v ? v.id : ""))).toEqual([u("b1")]);
    const corrections = await admin.as.query(api.exports.page, { kind: "corrections", from: day, to: day, paginationOpts: { cursor: null, numItems: 10 } });
    expect(corrections.page).toHaveLength(0);
  });
});

describe("Kurzbefehl-API", () => {
  const send = (t: T, path: string, token: string | null, body?: unknown, method = "POST") =>
    t.fetch(path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

  test("zählt, liest und nimmt den eigenen letzten Klick zurück", async () => {
    const t = setup();
    const staff = await signIn(t, "anna");
    const { token } = await staff.as.mutation(api.apiTokens.create, { name: "Annas iPhone" });
    expect((await send(t, "/api/v1/visit", token, { group: "u15" })).status).toBe(200);
    const added = await (await send(t, "/api/v1/visit", token, { group: "Ü15" })).json();
    expect([added.u15, added.o15, added.total]).toEqual([1, 1, 2]);
    expect(added.text).toContain("Ü15 +1");
    const live = await staff.as.query(api.visits.live, { date: added.date });
    expect([live.u15, live.o15]).toEqual([1, 1]);

    const undone = await (await send(t, "/api/v1/undo", token)).json();
    expect(undone.undone.group).toBe("o15");
    expect([undone.u15, undone.o15]).toEqual([1, 0]);
    const corrections = await t.run((ctx) => ctx.db.query("corrections").collect());
    expect(corrections.map((c) => [c.kind, c.username, c.deviceName])).toEqual([["undo", "anna", "Annas iPhone"]]);

    const today = await t.fetch(`/api/v1/today?format=text&token=${token}`);
    expect(await today.text()).toBe("U15: 1 · Ü15: 0 · Gesamt: 1");
    expect((await (await send(t, "/api/v1/undo", token, { group: "o15" })).json()).undone).toBeNull();
  });

  test("dieselbe Klick-ID zählt bei Wiederholung nur einmal", async () => {
    const t = setup();
    const staff = await signIn(t, "anna");
    const { token } = await staff.as.mutation(api.apiTokens.create, { name: "Handy" });
    const id = crypto.randomUUID();
    await send(t, "/api/v1/visit", token, { group: "u15", id });
    const again = await (await send(t, "/api/v1/visit", token, { group: "u15", id })).json();
    expect(again.u15).toBe(1);
  });

  test("Rückgängig betrifft nie Klicks anderer Mitarbeiter", async () => {
    const t = setup();
    const anna = await signIn(t, "anna"), ben = await signIn(t, "ben");
    const { token } = await anna.as.mutation(api.apiTokens.create, { name: "Handy" });
    const first = await (await send(t, "/api/v1/visit", token, { group: "u15" })).json();
    const now = new Date().toISOString();
    await ben.as.mutation(api.visits.upload, { records: [{ id: crypto.randomUUID(), group: "u15", timestamp: now, order: Date.parse(now) + 1, cancelled: false, userId: ben.id }] });
    await send(t, "/api/v1/undo", token);
    const live = await anna.as.query(api.visits.live, { date: first.date });
    expect(live.u15).toBe(1);
    expect((await (await send(t, "/api/v1/undo", token)).json()).undone).toBeNull();
  });

  test("ungültige, widerrufene und fremde Tokens werden abgewiesen", async () => {
    const t = setup();
    const anna = await signIn(t, "anna"), ben = await signIn(t, "ben");
    expect((await send(t, "/api/v1/visit", null, { group: "u15" })).status).toBe(401);
    expect((await send(t, "/api/v1/visit", `chx_${"0".repeat(64)}`, { group: "u15" })).status).toBe(401);
    const { token } = await anna.as.mutation(api.apiTokens.create, { name: "Handy" });
    expect((await send(t, "/api/v1/visit", token, { group: "kinder" })).status).toBe(400);
    // Write endpoints accept the token only as a header.
    expect((await t.fetch(`/api/v1/visit?group=u15&token=${token}`, { method: "POST" })).status).toBe(401);
    const [listed] = await anna.as.query(api.apiTokens.list, {});
    expect(listed.hint).toBe(token.slice(-4));
    await expect(ben.as.mutation(api.apiTokens.revoke, { id: listed.id })).rejects.toThrow("Token nicht gefunden");
    await anna.as.mutation(api.apiTokens.revoke, { id: listed.id });
    expect((await send(t, "/api/v1/today", token, undefined, "GET")).status).toBe(401);
  });

  test("gesperrte Benutzer können mit ihrem Token nicht mehr zählen", async () => {
    const t = setup();
    const anna = await signIn(t, "anna");
    const { token } = await anna.as.mutation(api.apiTokens.create, { name: "Handy" });
    await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: "user", where: [{ field: "_id", value: anna.id }], update: { banned: true } } });
    expect((await send(t, "/api/v1/visit", token, { group: "u15" })).status).toBe(401);
  });
});
