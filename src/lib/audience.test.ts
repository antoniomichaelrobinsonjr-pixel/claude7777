import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, defaultRatesFor, exampleData, newProject, type Project } from "./comps.ts";
import { buyerView, closestComps, marketPath, netProceeds, ownerSummary, perUnit, positionOf, projection, sellerView, trailingCagr } from "./audience.ts";
import { buildReport } from "./report.ts";
import { periodFromNumber, type IndexPoint } from "../market/series.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const home = (): Project => ({ ...newProject("t"), ...exampleData() });
const A = { low: 100, weighted: 110, high: 120 };

test("position against the supported range, including the edges", () => {
  assert.equal(positionOf(99.99, A), "belowRange");
  assert.equal(positionOf(100, A), "lowerHalf");
  assert.equal(positionOf(110, A), "lowerHalf");
  assert.equal(positionOf(110.01, A), "upperHalf");
  assert.equal(positionOf(120, A), "upperHalf");
  assert.equal(positionOf(120.01, A), "aboveRange");
});

test("net proceeds: percentage costs and a payoff come off the price; bad input can't inflate it", () => {
  near(netProceeds(500_000, { agentPct: 5, otherPct: 1.5, payoff: 200_000 }), 500_000 - 32_500 - 200_000);
  assert.equal(netProceeds(500_000, undefined), 500_000);
  assert.equal(netProceeds(500_000, { agentPct: -5, otherPct: NaN, payoff: -100 }), 500_000, "negative or invalid costs count as zero");
  assert.equal(netProceeds(500_000, { agentPct: 80, otherPct: 80, payoff: 0 }), 0, "costs are capped at the whole price");
  assert.ok(netProceeds(100_000, { agentPct: 5, otherPct: 0, payoff: 300_000 }) < 0, "a payoff bigger than the sale shows as negative");
});

test("seller view: needs comps; compares a list price with the range; nets out costs", () => {
  const p = home();
  assert.equal(sellerView({ ...p, comps: [] }, analyze({ ...p, comps: [] })), null);
  const a = analyze(p);
  const noList = sellerView(p, a)!;
  assert.equal(noList.list, null);
  assert.equal(noList.position, null);
  assert.equal(noList.hasCosts, false);
  const v = sellerView({ ...p, askingPrice: a.high + 10_000, sellerCosts: { agentPct: 5, otherPct: 1, payoff: 100_000 } }, a)!;
  assert.equal(v.position, "aboveRange");
  assert.ok(v.vsWeightedPct! > 0);
  assert.equal(v.hasCosts, true);
  near(v.net.weighted, a.weighted * 0.94 - 100_000);
  near(v.net.list!, (a.high + 10_000) * 0.94 - 100_000);
});

test("buyer view: asking vs weighted value, room to negotiate, and price per sq ft against the comps", () => {
  const p = home();
  const a = analyze(p);
  assert.equal(buyerView(p, a), null, "no asking price, no buyer view");
  assert.equal(buyerView({ ...p, askingPrice: 400_000 }, analyze({ ...p, comps: [] })), null);
  const over = buyerView({ ...p, askingPrice: Math.round(a.weighted * 1.1) }, a)!;
  near(over.vsWeightedPct!, 10, 0.01);
  near(over.roomToNegotiate, Math.round(a.weighted * 1.1) - a.weighted);
  assert.equal(over.land, false);
  near(over.askingPerUnit!, Math.round(a.weighted * 1.1) / p.subject.sqft);
  assert.ok(over.compsPerUnit! > 0);
  const under = buyerView({ ...p, askingPrice: Math.round(a.weighted * 0.9) }, a)!;
  assert.equal(under.roomToNegotiate, 0);
  assert.ok(under.position === "belowRange" || under.position === "lowerHalf");
  assert.equal(buyerView({ ...p, askingPrice: a.weighted }, a)!.position, "lowerHalf", "asking exactly the weighted value is in line with the comps");
  assert.equal(perUnit(100, { subject: { ...p.subject, sqft: 0 } }), null);
});

test("closest comps are the heaviest ones", () => {
  const a = analyze(home());
  const c = closestComps(a, 2);
  assert.equal(c.length, 2);
  assert.ok(c[0].weight >= c[1].weight);
  assert.ok(c.every((r) => a.rows.every((o) => o.weight <= c[0].weight + 1e-12)));
});

test("owner summary: gain, percent, compound growth, improvements; refuses nonsense", () => {
  const asOf = new Date("2026-06-01T00:00:00Z");
  const s = ownerSummary({ purchasePrice: 300_000, purchaseDate: "2016-06-01", improvements: 20_000 }, 450_000, asOf)!;
  near(s.years, 10, 0.01);
  assert.equal(s.gain, 150_000);
  near(s.gainPct, 50);
  near(s.cagrPct!, (1.5 ** (1 / s.years) - 1) * 100);
  assert.equal(s.gainAfterImprovements, 130_000);
  assert.equal(ownerSummary({ purchasePrice: 300_000, purchaseDate: "2026-01-01", improvements: 0 }, 310_000, asOf)!.cagrPct, null, "under a year is not annualised");
  assert.equal(ownerSummary({ purchasePrice: 300_000, purchaseDate: "2016-06-01", improvements: 0 }, 450_000, asOf)!.gainAfterImprovements, null);
  for (const bad of [undefined, { purchasePrice: 0, purchaseDate: "2016-06-01", improvements: 0 }, { purchasePrice: 3e5, purchaseDate: "junk", improvements: 0 }, { purchasePrice: 3e5, purchaseDate: "2030-01-01", improvements: 0 }])
    assert.equal(ownerSummary(bad as never, 450_000, asOf), null);
  assert.equal(ownerSummary({ purchasePrice: 3e5, purchaseDate: "2016-06-01", improvements: 0 }, 0, asOf), null);
});

// index rises 1 point a quarter: 2016-Q1 = 100 ... so value at a quarter is easy to predict
const idx = (): IndexPoint[] => Array.from({ length: 44 }, (_, i) => ({ period: periodFromNumber(2016 * 4 + i), value: 100 + i }));

test("market path: value at each anniversary scales today's value by the index; compares with the market", () => {
  const series = idx(); // last = 2026-Q4 = 143
  const asOf = new Date("2026-11-15T00:00:00Z");
  const o = { purchasePrice: 280_000, purchaseDate: "2016-05-10", improvements: 0 }; // 2016-Q2 = 101
  const path = marketPath(series, 430_000, o, asOf)!;
  assert.equal(path.points[0].kind, "purchase");
  assert.equal(path.points[path.points.length - 1].kind, "today");
  near(path.points[path.points.length - 1].value, 430_000);
  near(path.points[0].value, 430_000 * 101 / 143);
  assert.equal(path.points.filter((p) => p.kind === "anniversary").length, 10);
  const first = path.points.find((p) => p.kind === "anniversary")!; // 2017-05-10 = 2017-Q2 = 105
  assert.equal(first.period, "2017-Q2");
  near(first.value, 430_000 * 105 / 143);
  near(path.expectedToday!, 280_000 * 143 / 101);
  near(path.vsMarketPct!, (430_000 / (280_000 * 143 / 101) - 1) * 100);
  for (let i = 1; i < path.points.length; i++) assert.ok(path.points[i].ts > path.points[i - 1].ts && path.points[i].value > path.points[i - 1].value);
});

test("market path: purchase before the data starts keeps the points it can and gives no comparison", () => {
  const path = marketPath(idx(), 430_000, { purchasePrice: 280_000, purchaseDate: "2010-03-01", improvements: 0 }, new Date("2026-11-15T00:00:00Z"))!;
  assert.equal(path.expectedToday, null);
  assert.equal(path.vsMarketPct, null);
  assert.ok(path.points.length > 0 && path.points.every((p) => p.ts >= Date.UTC(2016, 0, 1)));
  assert.equal(marketPath([], 1, { purchasePrice: 1, purchaseDate: "2016-01-01", improvements: 0 }, new Date()), null);
  assert.equal(marketPath(idx(), 1, { purchasePrice: 1, purchaseDate: "2999-01-01", improvements: 0 }, new Date()), null);
});

test("trailing growth and projection arithmetic", () => {
  near(trailingCagr(idx(), 5)!, ((143 / 123) ** (1 / 5) - 1) * 100);
  assert.equal(trailingCagr(idx(), 40), null);
  assert.equal(trailingCagr([], 5), null);
  const rows = projection(100_000, [0, 3, 6], 10);
  assert.equal(rows.length, 11);
  assert.deepEqual(rows[0].values, [100_000, 100_000, 100_000]);
  near(rows[10].values[0], 100_000);
  near(rows[10].values[1], 100_000 * 1.03 ** 10);
  near(rows[10].values[2], 100_000 * 1.06 ** 10);
  near(projection(100_000, [-80, NaN, 900], 1)[1].values[0], 50_000, 1e-6);
  assert.equal(projection(1, [0, 0, 0], 999).length, 41, "capped at 40 years");
});

test("land: only size and the manual adjustment move the price; defaults and labels switch", () => {
  const land: Project = {
    ...newProject("land"),
    subject: { address: "Lot 4", kind: "land", sqft: 5, beds: 9, baths: 9, yearBuilt: 1900 },
    rates: defaultRatesFor({ kind: "land" }),
    comps: [{ id: "a", address: "x", salePrice: 100_000, saleDate: "2026-01-01", sqft: 4, beds: 1, baths: 1, yearBuilt: 2020, distanceMi: 1, otherAdj: 2_000, included: true }],
  };
  const a = analyze(land);
  assert.equal(a.rows[0].bedAdj, 0);
  assert.equal(a.rows[0].bathAdj, 0);
  assert.equal(a.rows[0].ageAdj, 0);
  near(a.rows[0].adjustedPrice, 100_000 + (5 - 4) * 8_000 + 2_000);
  const home1 = analyze({ ...land, subject: { ...land.subject, kind: "home" }, rates: { ...land.rates, perBed: 5000 } });
  assert.notEqual(home1.rows[0].bedAdj, 0, "the same data as a home does adjust for beds");
  const r = buildReport(land, new Date("2026-06-01"));
  assert.equal(r.usingDefaultRates, true);
  assert.equal(buildReport({ ...land, rates: { ...land.rates, perSqft: 9_000 } }, new Date("2026-06-01")).usingDefaultRates, false);
  assert.equal(buildReport({ ...land, subject: { ...land.subject, kind: "home" } }, new Date("2026-06-01")).usingDefaultRates, false, "land defaults are not the home defaults");
  assert.equal(buyerView({ ...land, askingPrice: 120_000 }, a)!.land, true);
});
