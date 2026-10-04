import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, gradeFor } from "./report.ts";
import { DEFAULT_RATES, type Comp, type Project } from "./comps.ts";

const ASOF = new Date("2026-10-01T00:00:00Z");
const comp = (o: Partial<Comp>): Comp => ({
  id: Math.random().toString(36).slice(2), address: "a", salePrice: 400000, saleDate: "2026-09-01",
  sqft: 2000, beds: 3, baths: 2, yearBuilt: 2000, distanceMi: 0.3, otherAdj: 0, included: true, source: "MLS", ...o,
});
const project = (comps: Comp[], o: Partial<Project> = {}): Project => ({
  id: "p", name: "n", updatedAt: "", rates: { ...DEFAULT_RATES, perSqft: 55 }, ratesBasis: "Paired-sales study, Q3",
  subject: { address: "s", sqft: 2000, beds: 3, baths: 2, yearBuilt: 2000 }, comps, ...o,
});
const five = () => [0, 1, 2, 3, 4].map((i) => comp({ salePrice: 400000 + i * 2000 }));

test("well-supported analysis grades High", () => {
  const r = buildReport(project(five()), ASOF);
  assert.equal(r.grade, "High");
  assert.ok(r.score >= 80);
  assert.deepEqual(r.caps, []);
});

test("grade thresholds", () => {
  assert.equal(gradeFor(80), "High");
  assert.equal(gradeFor(79), "Moderate");
  assert.equal(gradeFor(59), "Limited");
  assert.equal(gradeFor(39), "Low");
});

test("placeholder default rates cap the grade at Moderate and are disclosed", () => {
  const r = buildReport(project(five(), { rates: { ...DEFAULT_RATES }, ratesBasis: "" }), ASOF);
  assert.ok(r.score <= 79);
  assert.equal(r.usingDefaultRates, true);
  assert.ok(r.caps.some((c) => c.includes("placeholder")));
  assert.ok(r.limitations.some((l) => l.includes("not been derived from market data")));
});

test("stating a basis for default-valued rates lifts the cap", () => {
  const r = buildReport(project(five(), { rates: { ...DEFAULT_RATES }, ratesBasis: "Local appraiser, 2026" }), ASOF);
  assert.deepEqual(r.caps, []);
});

test("fewer than 3 comps caps the grade at Limited", () => {
  const r = buildReport(project([comp({}), comp({})]), ASOF);
  assert.ok(r.score <= 55);
  assert.notEqual(r.grade, "High");
  assert.ok(r.limitations.some((l) => l.includes("Fewer than three")));
});

test("missing dates and distances never raise the score", () => {
  const full = buildReport(project(five()), ASOF);
  const blank = buildReport(project(five().map((c) => ({ ...c, saleDate: "", distanceMi: 0 }))), ASOF);
  assert.ok(blank.score < full.score);
  assert.equal(blank.factors.find((f) => f.key === "recency")!.score, null);
  assert.equal(blank.factors.find((f) => f.key === "proximity")!.score, null);
});

test("stale, distant, heavily adjusted comps score worse than fresh, close ones", () => {
  const bad = five().map((c) => ({ ...c, saleDate: "2025-08-01", distanceMi: 2.8, sqft: 4000 }));
  const r = buildReport(project(bad), ASOF);
  assert.ok(r.score < buildReport(project(five()), ASOF).score);
  assert.ok(r.comps[0].flags.some((f) => f.includes("6 months")));
  assert.ok(r.comps[0].flags.some((f) => f.includes("Heavily adjusted")));
});

test("outlier is flagged and unsourced comps are called out", () => {
  const comps = [comp({}), comp({}), comp({}), comp({ salePrice: 520000, source: "" })];
  const r = buildReport(project(comps), ASOF);
  const out = r.comps[3];
  assert.ok(out.flags.some((f) => f.includes("median")));
  assert.ok(out.flags.includes("No source recorded"));
  assert.ok(r.limitations.some((l) => l.includes("no recorded source")));
});

test("age is measured from the report date", () => {
  const r = buildReport(project([comp({ saleDate: "2026-09-21" })]), ASOF);
  assert.equal(r.comps[0].ageDays, 10);
});
