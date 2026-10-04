import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustComp, analyze, defaultRatesFor, DEFAULT_ESTATE_RATES, DEFAULT_RATES, DEFAULT_UNIT_RATES, newProject, PROPERTY_KINDS, type Comp, type Project, type PropertyKind, type Subject } from "./comps.ts";
import { buildReport } from "./report.ts";
import { buyerView } from "./audience.ts";
import { PROFILES, profileFor } from "./profile.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const comp = (o: Partial<Comp> = {}): Comp => ({ id: "c", address: "x", salePrice: 500_000, saleDate: "2026-05-01", sqft: 1000, beds: 2, baths: 1, yearBuilt: 2000, distanceMi: 0.2, otherAdj: 0, included: true, source: "MLS", ...o });
const subj = (kind: PropertyKind, o: Partial<Subject> = {}): Subject => ({ address: "s", kind, sqft: 1000, beds: 2, baths: 1, yearBuilt: 2000, ...o });
const project = (kind: PropertyKind, comps: Comp[], s: Partial<Subject> = {}): Project => ({ ...newProject("t"), subject: subj(kind, s), rates: defaultRatesFor({ kind }), comps });

test("every property type has defaults, a profile and a label key", () => {
  assert.deepEqual(PROPERTY_KINDS, ["home", "apartment", "condo", "estate", "land"]);
  for (const k of PROPERTY_KINDS) { assert.ok(defaultRatesFor({ kind: k }).perSqft > 0, k); assert.ok(PROFILES[k].proxZero > PROFILES[k].proxFull, k); }
  assert.deepEqual(defaultRatesFor({}), DEFAULT_RATES);
  assert.deepEqual(defaultRatesFor({ kind: "apartment" }), DEFAULT_UNIT_RATES);
  assert.deepEqual(defaultRatesFor({ kind: "condo" }), DEFAULT_UNIT_RATES);
  assert.deepEqual(defaultRatesFor({ kind: "estate" }), DEFAULT_ESTATE_RATES);
  assert.notEqual(defaultRatesFor({ kind: "home" }), DEFAULT_RATES, "defaults are copies, so editing one can't change the constant");
  assert.equal(profileFor(undefined), PROFILES.home);
});

test("apartments and condos: floor, parking and fee adjust the comp toward the subject", () => {
  for (const kind of ["apartment", "condo"] as const) {
    const rates = { ...defaultRatesFor({ kind }), perFloor: 1000, perParking: 20_000, perFee: 100 };
    const s = subj(kind, { floor: 12, parking: 2, monthlyFee: 500 });
    const c = comp({ floor: 5, parking: 1, monthlyFee: 400 });
    const r = adjustComp(s, c, rates);
    near(r.floorAdj, 7 * 1000);          // subject is 7 floors higher: worth more
    near(r.parkingAdj, 1 * 20_000);      // one more space
    near(r.feeAdj, (400 - 500) * 100);   // a higher fee for the subject lowers its value
    near(r.netAdj, r.sqftAdj + r.bedAdj + r.bathAdj + r.ageAdj + 7000 + 20_000 - 10_000);
    assert.ok(r.grossAdjPct >= ((7000 + 20_000 + 10_000) / 500_000) * 100 - 1e-9, "gross counts every adjustment");
  }
});

test("a figure that wasn't entered never creates an adjustment", () => {
  const rates = defaultRatesFor({ kind: "apartment" });
  const s = subj("apartment", { floor: 12, parking: 2, monthlyFee: 500 });
  for (const missing of [{}, { floor: undefined, parking: undefined, monthlyFee: undefined }]) {
    const r = adjustComp(s, comp(missing), rates);
    assert.deepEqual([r.floorAdj, r.parkingAdj, r.feeAdj], [0, 0, 0]);
  }
  const r = adjustComp(subj("apartment"), comp({ floor: 3, parking: 1, monthlyFee: 200 }), rates);
  assert.deepEqual([r.floorAdj, r.parkingAdj, r.feeAdj], [0, 0, 0], "subject side blank too");
  const zero = adjustComp(subj("apartment", { parking: 0 }), comp({ parking: 1 }), rates);
  near(zero.parkingAdj, -20_000, 1e-6); // an entered zero is a real answer: no parking is worth less
});

test("estates adjust for grounds; other types ignore the unit and estate fields", () => {
  const rates = { ...defaultRatesFor({ kind: "estate" }), perAcre: 50_000 };
  const r = adjustComp(subj("estate", { acres: 6 }), comp({ acres: 4 }), rates);
  near(r.acreAdj, 100_000);
  const extras = { floor: 9, parking: 3, monthlyFee: 900, acres: 9 };
  for (const kind of ["home", "land"] as const) {
    const q = adjustComp(subj(kind, { ...extras, floor: 1 }), comp(extras), { ...defaultRatesFor({ kind }), perFloor: 1e6, perParking: 1e6, perFee: 1e6, perAcre: 1e6 });
    assert.deepEqual([q.floorAdj, q.parkingAdj, q.feeAdj, q.acreAdj], [0, 0, 0, 0], kind);
  }
  const u = adjustComp(subj("estate", { ...extras }), comp({ floor: 1 }), { ...rates, perFloor: 1e6 });
  assert.equal(u.floorAdj, 0, "an estate has no floor adjustment");
  const unit = adjustComp(subj("apartment", { acres: 6 }), comp({ acres: 1 }), { ...rates });
  assert.equal(unit.acreAdj, 0, "a unit has no grounds adjustment");
});

test("analysis uses the extra adjustments in the value", () => {
  const p = project("apartment", [comp({ floor: 2 }), comp({ id: "d", floor: 2 })], { floor: 10 });
  p.rates = { ...p.rates, perFloor: 2_000 };
  const a = analyze(p);
  near(a.rows[0].adjustedPrice, 500_000 + 8 * 2_000);
  near(a.weighted, 516_000);
});

test("reliability thresholds follow the property type", () => {
  const asOf = new Date("2026-09-01T00:00:00Z");
  // one comp, sold ~14 months ago, 8 miles away: poor for a home, acceptable for an estate
  const far = (kind: PropertyKind) => buildReport(project(kind, [comp({ saleDate: "2025-07-01", distanceMi: 8 }), comp({ id: "b", saleDate: "2025-07-10", distanceMi: 8 }), comp({ id: "c", saleDate: "2025-08-01", distanceMi: 8 })]), asOf);
  const score = (r: ReturnType<typeof far>, key: string) => r.factors.find((f) => f.key === key)!.score!;
  const home = far("home"), estate = far("estate");
  assert.equal(score(home, "recency"), 0);
  assert.ok(score(estate, "recency") > 30, "an estate sale a year old still counts for something");
  assert.equal(score(home, "proximity"), 0);
  assert.ok(score(estate, "proximity") > 40, "8 miles is normal for an estate");
});

test("flags use the type's own distance and age limits and say what they are", () => {
  const asOf = new Date("2026-09-01T00:00:00Z");
  const flags = (kind: PropertyKind, c: Partial<Comp>) => buildReport(project(kind, [comp(c)]), asOf).comps[0].flags.map((f) => f.key);
  assert.ok(flags("home", { distanceMi: 1.5 }).includes("flag.far"), "homes keep the original wording");
  assert.ok(!flags("estate", { distanceMi: 3 }).includes("flag.farMiles") && !flags("estate", { distanceMi: 3 }).includes("flag.far"), "3 miles is close for an estate");
  assert.ok(flags("estate", { distanceMi: 6 }).includes("flag.farMiles"));
  assert.ok(flags("apartment", { distanceMi: 0.7 }).includes("flag.farMiles"), "0.7 miles is far for an apartment");
  assert.ok(!flags("home", { distanceMi: 0.7 }).includes("flag.far"));
  assert.ok(flags("home", { saleDate: "2026-01-01" }).includes("flag.old"));
  assert.ok(!flags("estate", { saleDate: "2026-01-01" }).includes("flag.oldMonths"), "8 months is fine for an estate");
  assert.ok(flags("estate", { saleDate: "2025-01-01" }).includes("flag.oldMonths"));
  const m = buildReport(project("estate", [comp({ distanceMi: 6 })]), asOf).comps[0].flags.find((f) => f.key === "flag.farMiles")!;
  assert.equal((m.vars!.miles as { v: number }).v, 5, "the message carries the limit that applies");
});

test("the rules shown on the report state the thresholds that were used", () => {
  const r = buildReport(project("estate", [comp()]), new Date("2026-09-01T00:00:00Z"));
  assert.equal(r.rules.recency.key, "factor.recency.ruleDays");
  assert.equal((r.rules.recency.vars!.zero as number | { v: number }) instanceof Object ? (r.rules.recency.vars!.zero as { v: number }).v : r.rules.recency.vars!.zero, 730);
  assert.equal(r.rules.proximity.key, "factor.proximity.ruleMiles");
  assert.equal(buildReport(project("home", [comp()])).rules.recency.key, "factor.recency.rule", "homes keep the original rule text");
});

test("limitations name what a table of comps can't see for each type", () => {
  const lims = (kind: PropertyKind) => buildReport(project(kind, [comp()])).limitations.map((l) => l.key);
  assert.ok(lims("apartment").includes("lim.unit") && lims("condo").includes("lim.unit"));
  assert.ok(lims("estate").includes("lim.estate"));
  assert.ok(lims("land").includes("lim.land"));
  assert.ok(!["lim.unit", "lim.estate", "lim.land"].some((k) => lims("home").includes(k)));
  for (const k of PROPERTY_KINDS) assert.ok(lims(k).includes("lim.notAppraisal"), `${k} still says it is not an appraisal`);
});

test("default-rate cap applies to each type's own defaults, not another's", () => {
  for (const kind of PROPERTY_KINDS) {
    const p = project(kind, [comp(), comp({ id: "b" }), comp({ id: "c" })]);
    assert.equal(buildReport(p).usingDefaultRates, true, `${kind} defaults are recognised`);
    assert.equal(buildReport({ ...p, rates: { ...p.rates, perSqft: p.rates.perSqft + 1 } }).usingDefaultRates, false, `${kind} edited rates are recognised`);
  }
  const unitWithHomeRates = project("apartment", [comp()]);
  unitWithHomeRates.rates = { ...DEFAULT_RATES };
  assert.equal(buildReport(unitWithHomeRates).usingDefaultRates, false);
});

test("buyer view works for apartments, condos and estates (price per size, not land)", () => {
  for (const kind of ["apartment", "condo", "estate"] as const) {
    const p = { ...project(kind, [comp(), comp({ id: "b", salePrice: 520_000 })]), askingPrice: 540_000 };
    const v = buyerView(p, analyze(p))!;
    assert.equal(v.land, false);
    assert.ok(v.askingPerUnit! > 0 && v.compsPerUnit! > 0);
  }
});

test("distance rules show their exact values (0.25 is not rounded to 0.3)", () => {
  const r = buildReport(project("apartment", [comp()]));
  const full = r.rules.proximity.vars!.full as { v: number; f: string };
  assert.deepEqual(full, { v: 0.25, f: "dec2" });
  assert.deepEqual(r.rules.proximity.vars!.zero, { v: 2, f: "int" });
  assert.deepEqual(buildReport(project("estate", [comp()])).rules.proximity.vars!.full, { v: 2, f: "int" });
  assert.deepEqual(buildReport(project("land", [comp()])).rules.proximity.vars!.zero, { v: 10, f: "int" });
  assert.deepEqual(buildReport(project("apartment", [comp({ distanceMi: 3 })])).comps[0].flags.find((f) => f.key === "flag.farMiles")!.vars!.miles, { v: 0.5, f: "dec1" });
});
