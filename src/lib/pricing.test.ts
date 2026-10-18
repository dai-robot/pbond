import assert from "node:assert/strict";
import test from "node:test";
import { jgbCompoundPct, pricingByJgb } from "./pricing.ts";

test("国債単利 1.005% は複利 1.007% になり、32bp を足すと 1.327%", () => {
  assert.equal(jgbCompoundPct(1.005), 1.007);
  const row = pricingByJgb(1.005, 32).find((r) => r.jgbSimplePct === 1.005);
  assert.ok(row);
  assert.equal(row.jgbCompoundPct, 1.007);
  assert.equal(row.theoreticalPct, 1.327);
  assert.equal(row.couponPct, 1.327);
  assert.equal(row.priceYen, 100);
  assert.equal(row.bondSimplePct, 1.327);
  assert.equal(row.bondCompoundPct, 1.327);
});

test("国債単利は 0.005% 刻みで、スプレッドは全行同じ", () => {
  const rows = pricingByJgb(1.005, 32);
  assert.equal(rows.length, 21);
  assert.equal(rows[0].jgbSimplePct, 0.955);
  assert.equal(rows.at(-1)?.jgbSimplePct, 1.055);
  assert.equal(rows[0].theoreticalPct, rows[0].jgbCompoundPct + 0.32);
  assert.equal(rows[1].jgbSimplePct, 0.96);
  const mid = rows.find((r) => r.jgbSimplePct === 1);
  assert.equal(mid?.jgbCompoundPct, 1.002);
  assert.equal(mid?.theoreticalPct, 1.322);
});
