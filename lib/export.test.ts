import test from "node:test";
import assert from "node:assert/strict";
import { csv, validDay } from "./export.ts";
test("CSV preserves umlauts, quotes and separators and neutralizes spreadsheet formulas", () => {
  const value = csv([["Ü15", 'a"b;c', "=HYPERLINK(1)", "  +SUM(1)", "\tattack", null]]);
  assert.equal(value, '\ufeff"Ü15";"a""b;c";"\'=HYPERLINK(1)";"\'  +SUM(1)";"\'\tattack";""\r\n');
});
test("export date validation rejects calendar rollover and query injection", () => {
  assert.equal(validDay("2024-02-29"), true);
  for (const value of [null, "2026-02-29", "2026-13-01", "2026-01-01;DROP TABLE", "not-a-date"]) assert.equal(validDay(value), false);
});
