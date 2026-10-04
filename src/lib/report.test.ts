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

test("equal weights by default; no custom flag", () => {
  const r = buildReport(project(five()), ASOF);
  assert.equal(r.customWeights, false);
  assert.equal(r.equalWeightScore, r.score);
  assert.ok(r.factors.every((f) => Math.round(f.weightPct) === 20));
});

test("custom weights change the score and are disclosed alongside the equal-weight score", () => {
  // Old sales: recency is the weak check, so weighting it up must lower the score.
  const old = five().map((c) => ({ ...c, saleDate: "2026-01-15" }));
  const base = buildReport(project(old), ASOF);
  const heavy = buildReport(project(old, { checkWeights: { recency: 10 } }), ASOF);
  assert.equal(heavy.customWeights, true);
  assert.ok(heavy.score < base.score);
  assert.equal(heavy.equalWeightScore, base.score);
  assert.ok(heavy.limitations.some((l) => l.includes("weighted by the preparer")));
  assert.ok(Math.abs(heavy.factors.reduce((s, f) => s + f.weightPct, 0) - 100) < 1e-9);
});

test("all-zero weights fall back to equal; weights are clamped to 0-10", () => {
  const z = buildReport(project(five(), { checkWeights: { count: 0, recency: 0, proximity: 0, similarity: 0, consistency: 0 } }), ASOF);
  assert.equal(z.customWeights, false);
  const big = buildReport(project(five(), { checkWeights: { count: 999, recency: -5 } }), ASOF);
  assert.equal(big.factors.find((f) => f.key === "count")!.weight, 10);
  assert.equal(big.factors.find((f) => f.key === "recency")!.weight, 0);
});

test("weights cannot lift a capped grade", () => {
  const r = buildReport(project(five(), { rates: { ...DEFAULT_RATES }, ratesBasis: "", checkWeights: { count: 10 } }), ASOF);
  assert.ok(r.score <= 79);
});

test("trend: fits a rising market and reports the monthly change", () => {
  // price per sq ft rises 1% per month from $200
  const mk = (months: number) => {
    const d = new Date(Date.UTC(2026, 0, 1) + months * 30.4375 * 86_400_000).toISOString().slice(0, 10);
    return comp({ saleDate: d, sqft: 2000, salePrice: Math.round(2000 * 200 * (1 + 0.01 * months)) });
  };
  const r = buildReport(project([mk(0), mk(2), mk(4), mk(6)]), ASOF);
  assert.equal(r.trend.points.length, 4);
  assert.ok(r.trend.slopePctPerMonth !== null);
  assert.ok(Math.abs(r.trend.slopePctPerMonth! - 0.95) < 0.2, String(r.trend.slopePctPerMonth));
  assert.ok(r.trend.r2! > 0.99);
});

test("trend: refuses to draw a line from too little data", () => {
  const few = buildReport(project([comp({}), comp({}), comp({})]), ASOF);
  assert.equal(few.trend.slopePctPerMonth, null);
  assert.ok(few.trend.note.includes("at least 4"));
  const close = buildReport(project(five()), ASOF); // all sold the same day
  assert.equal(close.trend.slopePctPerMonth, null);
  assert.ok(close.trend.note.includes("two months"));
});

test("trend ignores comps with no date, no size, or a future date", () => {
  const r = buildReport(project([comp({ saleDate: "" }), comp({ sqft: 0 }), comp({ saleDate: "2027-05-01" }), comp({})]), ASOF);
  assert.equal(r.trend.points.length, 1);
});

test("a strong price trend is called out as an unadjusted timing risk", () => {
  const mk = (months: number) => {
    const d = new Date(Date.UTC(2026, 0, 1) + months * 30.4375 * 86_400_000).toISOString().slice(0, 10);
    return comp({ saleDate: d, sqft: 2000, salePrice: Math.round(2000 * 200 * (1 + 0.012 * months)) });
  };
  const r = buildReport(project([mk(0), mk(2), mk(4), mk(6)]), ASOF);
  assert.ok(r.limitations.some((l) => l.includes("rising") && l.includes("not adjusted for date of sale")));
  const flat = buildReport(project(five()), ASOF);
  assert.ok(!flat.limitations.some((l) => l.includes("not adjusted for date of sale")));
});
