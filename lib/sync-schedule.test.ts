import assert from "node:assert/strict";
import test from "node:test";
import { syncDelay } from "./sync-schedule.ts";

test("a ten-hour idle tablet polls at most twice a minute after the first minute", () => {
  let elapsed = 0, polls = 0;
  while (elapsed < 10 * 60 * 60 * 1000) {
    elapsed += syncDelay(elapsed, 0);
    polls++;
  }
  assert.ok(polls < 1250);
  assert.equal(syncDelay(0, 0), 3000); // Interaction restores live updates.
});

test("an unavailable database backs off to one attempt per minute and recovers immediately", () => {
  assert.deepEqual([1,2,3,4,5,6].map(failures => syncDelay(0, failures)), [6000,12000,24000,48000,60000,60000]);
  assert.equal(syncDelay(0, 0), 3000);
});
