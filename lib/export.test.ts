import test from "node:test";
import assert from "node:assert/strict";
import { monthlyRows, csv, validDay } from "./export.ts";
test("CSV preserves umlauts, quotes and separators and neutralizes spreadsheet formulas", () => {
  const value = csv([["Ü15", 'a"b;c', "=HYPERLINK(1)", "  +SUM(1)", "\tattack", null]]);
  assert.equal(value, '\ufeff"Ü15";"a""b;c";"\'=HYPERLINK(1)";"\'  +SUM(1)";"\'\tattack";""\r\n');
});
test("export date validation rejects calendar rollover and query injection", () => {
  assert.equal(validDay("2024-02-29"), true);
  for (const value of [null, "2026-02-29", "2026-13-01", "2026-01-01;DROP TABLE", "not-a-date"]) assert.equal(validDay(value), false);
});

test("monthly rows add up opening days per month", () => {
  assert.deepEqual(monthlyRows([
    { date: "2026-09-30", u15: 3, o15: 1 },
    { date: "2026-10-01", u15: 10, o15: 5 },
    { date: "2026-10-02", u15: 0, o15: 0 },
    { date: "2026-10-05", u15: 6, o15: 4 },
  ]), [["2026-09", 1, 3, 1, 4, "4"], ["2026-10", 2, 16, 9, 25, "12,5"]]);
});
