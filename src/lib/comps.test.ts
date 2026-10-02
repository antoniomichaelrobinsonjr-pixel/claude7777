import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, DEFAULT_RATES, type Comp } from "./comps.ts";

const comp = (o: Partial<Comp>): Comp => ({
  id: "x", address: "", salePrice: 400000, saleDate: "", sqft: 2000, beds: 3, baths: 2,
  yearBuilt: 2000, distanceMi: 0.5, otherAdj: 0, included: true, ...o,
});
const subject = { address: "s", sqft: 2100, beds: 3, baths: 2, yearBuilt: 2000 };

test("sqft difference adjusts toward subject", () => {
  const a = analyze({ subject, comps: [comp({})], rates: DEFAULT_RATES });
  assert.equal(a.rows[0].adjustedPrice, 400000 + 100 * 60);
});

test("excluded comps are ignored; empty yields zeros", () => {
  const a = analyze({ subject, comps: [comp({ included: false })], rates: DEFAULT_RATES });
  assert.equal(a.count, 0);
  assert.equal(a.weighted, 0);
});

test("median and range", () => {
  const a = analyze({
    subject: { ...subject, sqft: 2000 },
    comps: [comp({ salePrice: 300000 }), comp({ salePrice: 400000 }), comp({ salePrice: 500000 })],
    rates: DEFAULT_RATES,
  });
  assert.equal(a.median, 400000);
  assert.equal(a.low, 300000);
  assert.equal(a.high, 500000);
});
