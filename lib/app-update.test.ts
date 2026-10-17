import assert from "node:assert/strict";
import test from "node:test";
import { updateBlock, RELOAD_COOLDOWN } from "./app-update.ts";
const safe = { online: true, pending: 0, formDirty: false, editing: false, idleMs: 12_000, version: "deployment-b", now: 1_000_000 };
test("an update waits for all queued clicks, connectivity and an idle operator", () => {
  assert.equal(updateBlock({ ...safe, pending: 1 }), "pending");
  assert.equal(updateBlock({ ...safe, online: false }), "offline");
  assert.equal(updateBlock({ ...safe, idleMs: 9_999 }), "busy");
  assert.equal(updateBlock(safe), null);
});
test("updates never interrupt a form draft or an active input", () => {
  assert.equal(updateBlock({ ...safe, formDirty: true }), "form");
  assert.equal(updateBlock({ ...safe, editing: true }), "form");
});
test("a deployment served stale after reload cannot cause a reload loop", () => {
  assert.equal(updateBlock({ ...safe, attemptedVersion: safe.version, attemptedAt: safe.now - 1 }), "cooldown");
  assert.equal(updateBlock({ ...safe, attemptedVersion: safe.version, attemptedAt: safe.now - RELOAD_COOLDOWN }), null);
  assert.equal(updateBlock({ ...safe, attemptedVersion: "deployment-a", attemptedAt: safe.now - 1 }), null);
});
