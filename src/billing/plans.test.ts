import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PLANS, PLAN_IDS, INTERVALS, FEATURES, can, requiredPlan, nextPlan, monthlyEquivalentCents, yearlySavingsPct,
  applyPlan, lockedCompCount, canCreateAnalysis, canAddComp, isPlanId, isInterval,
} from "./plans.ts";
import type { Comp, Project } from "../lib/comps.ts";

const comp = (i: number, included = true): Comp => ({
  id: `c${i}`, address: `${i}`, salePrice: 400000, saleDate: "", sqft: 2000, beds: 3, baths: 2, yearBuilt: 2000, distanceMi: 0.5, otherAdj: 0, included,
});
const project = (n: number): Project => ({
  id: "p", name: "n", updatedAt: "", rates: { perSqft: 60, perBed: 5000, perBath: 7500, perYear: 500 },
  subject: { address: "", sqft: 2000, beds: 3, baths: 2, yearBuilt: 2000 }, comps: Array.from({ length: n }, (_, i) => comp(i)),
});

test("four tiers, ranked, each a superset of the one below", () => {
  assert.deepEqual(PLAN_IDS, ["starter", "plus", "pro", "studio"]);
  for (let i = 1; i < PLAN_IDS.length; i++) {
    const lower = PLANS[PLAN_IDS[i - 1]], higher = PLANS[PLAN_IDS[i]];
    assert.ok(higher.rank > lower.rank);
    for (const f of lower.features) assert.ok(higher.features.includes(f), `${higher.id} lacks ${f}`);
    assert.ok(higher.features.length > lower.features.length, `${higher.id} adds nothing over ${lower.id}`);
    assert.ok(higher.maxComps > lower.maxComps);
  }
});

test("every feature is sold by exactly one cheapest tier, and the free tier has none", () => {
  assert.deepEqual(PLANS.starter.features, []);
  for (const f of FEATURES) assert.ok(PLAN_IDS.some((p) => can(p, f)), `${f} is in no plan`);
  assert.equal(requiredPlan("report"), "plus");
  assert.equal(requiredPlan("reportGrade"), "pro");
  assert.equal(requiredPlan("whiteLabel"), "studio");
});

test("pricing is sane: free is free, tiers cost more as they go up, weekly > monthly > yearly per month", () => {
  for (const i of INTERVALS) assert.equal(PLANS.starter.prices[i], null);
  for (const id of ["plus", "pro", "studio"] as const) {
    const w = monthlyEquivalentCents(id, "week")!, m = monthlyEquivalentCents(id, "month")!, y = monthlyEquivalentCents(id, "year")!;
    assert.ok(w > m && m > y, `${id}: ${w} ${m} ${y}`);
    const pr = PLANS[id].prices;
    for (const iv of INTERVALS) assert.ok(Number.isInteger(pr[iv]!) && pr[iv]! > 0);
    const save = yearlySavingsPct(id)!;
    assert.ok(save >= 20 && save <= 35, `${id} yearly saving ${save}%`);
  }
  for (const iv of INTERVALS) {
    assert.ok(PLANS.plus.prices[iv]! < PLANS.pro.prices[iv]!);
    assert.ok(PLANS.pro.prices[iv]! < PLANS.studio.prices[iv]!);
  }
  assert.equal(yearlySavingsPct("starter"), null);
  assert.equal(monthlyEquivalentCents("starter", "month"), null);
});

test("nextPlan walks the ladder", () => {
  assert.equal(nextPlan("starter"), "plus");
  assert.equal(nextPlan("pro"), "studio");
  assert.equal(nextPlan("studio"), null);
});

test("comp limit: extra comps are held back, never deleted, and the original is untouched", () => {
  const p = project(7);
  const limited = applyPlan(p, "starter"); // limit 4
  assert.equal(limited.comps.length, 7);
  assert.equal(limited.comps.filter((c) => c.included).length, 4);
  assert.deepEqual(limited.comps.filter((c) => !c.included).map((c) => c.id), ["c4", "c5", "c6"]);
  assert.equal(p.comps.filter((c) => c.included).length, 7);
  assert.equal(lockedCompCount(p, "starter"), 3);
  assert.equal(applyPlan(p, "plus"), p, "unchanged when within the limit returns the same object");
  assert.equal(lockedCompCount(p, "plus"), 0);
});

test("the comp limit counts every comp by position, like the database does, so unticking a comp doesn't dodge it", () => {
  const p = project(6);
  p.comps[1].included = false;
  // limit 4 -> positions 4 and 5 are beyond it, whether or not earlier comps are ticked
  const limited = applyPlan(p, "starter");
  assert.equal(limited.comps[1].included, false);
  assert.equal(limited.comps[3].included, true);
  assert.equal(limited.comps[4].included, false);
  assert.equal(limited.comps[5].included, false);
  assert.equal(lockedCompCount(p, "starter"), 2);
  // a comp beyond the limit that was already switched off is not counted as "held back"
  p.comps[5].included = false;
  assert.equal(lockedCompCount(p, "starter"), 1);
});

test("analysis and comp creation limits", () => {
  assert.equal(canCreateAnalysis("starter", 1), true);
  assert.equal(canCreateAnalysis("starter", 2), false);
  assert.equal(canCreateAnalysis("starter", 9), false);
  assert.equal(canCreateAnalysis("plus", 500), true);
  assert.equal(canAddComp("starter", 3), true);
  assert.equal(canAddComp("starter", 4), false);
  assert.equal(canAddComp("studio", 39), true);
  assert.equal(canAddComp("studio", 40), false);
});

test("input guards", () => {
  assert.equal(isPlanId("pro"), true);
  assert.equal(isPlanId("enterprise"), false);
  assert.equal(isPlanId(undefined), false);
  assert.equal(isInterval("week"), true);
  assert.equal(isInterval("day"), false);
});
