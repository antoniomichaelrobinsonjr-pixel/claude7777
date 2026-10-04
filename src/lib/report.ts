import { analyze, DEFAULT_RATES, type Project } from "./comps.ts";

/** Linear score: 100 when value <= full, 0 when value >= zero. */
const lin = (value: number, full: number, zero: number) =>
  Math.max(0, Math.min(100, ((zero - value) / (zero - full)) * 100));

export interface CompEvidence {
  id: string;
  address: string;
  source: string;
  salePrice: number;
  adjustedPrice: number;
  weight: number;
  /** Days between sale and the report date; null when no valid date was entered. */
  ageDays: number | null;
  distanceMi: number | null;
  sqftDiffPct: number | null;
  grossAdjPct: number;
  netAdjPct: number;
  /** How far the adjusted price sits from the median adjusted price. */
  deviationPct: number;
  flags: string[];
}

export interface Factor {
  key: "count" | "recency" | "proximity" | "similarity" | "consistency";
  label: string;
  /** 0-100, or null when the data needed to score it was not provided. */
  score: number | null;
  value: string;
  rule: string;
}

export type Grade = "High" | "Moderate" | "Limited" | "Low";

export interface Report {
  asOf: string;
  count: number;
  comps: CompEvidence[];
  factors: Factor[];
  score: number;
  grade: Grade;
  /** Reasons the grade was capped below what the raw score would give. */
  caps: string[];
  /** Plain statements about what the estimate does and does not rest on. */
  limitations: string[];
  usingDefaultRates: boolean;
  spreadPct: number;
  cvPct: number | null;
}

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export const gradeFor = (score: number): Grade =>
  score >= 80 ? "High" : score >= 60 ? "Moderate" : score >= 40 ? "Limited" : "Low";

const COUNT_SCORES = [0, 20, 40, 70, 85, 100];

export function buildReport(project: Project, asOf: Date = new Date()): Report {
  const a = analyze(project);
  const { subject, rates } = project;
  const med = a.count ? median(a.rows.map((r) => r.adjustedPrice)) : 0;

  const comps: CompEvidence[] = a.rows.map((r) => {
    const c = r.comp;
    const t = c.saleDate ? Date.parse(c.saleDate) : NaN;
    const ageDays = Number.isFinite(t) ? Math.floor((asOf.getTime() - t) / 86_400_000) : null;
    const flags: string[] = [];
    if (ageDays === null) flags.push("No sale date");
    else if (ageDays < 0) flags.push("Sale date is in the future");
    else if (ageDays > 180) flags.push("Sold more than 6 months ago");
    if (!(c.distanceMi > 0)) flags.push("No distance entered");
    else if (c.distanceMi > 1) flags.push("More than 1 mile away");
    if (!c.source?.trim()) flags.push("No source recorded");
    if (r.grossAdjPct > 25) flags.push("Heavily adjusted (over 25%)");
    const deviationPct = med > 0 ? ((r.adjustedPrice - med) / med) * 100 : 0;
    if (a.count >= 3 && Math.abs(deviationPct) > 10) flags.push("Adjusted price differs from the median by over 10%");
    return {
      id: c.id,
      address: c.address || "Unnamed comp",
      source: c.source?.trim() ?? "",
      salePrice: c.salePrice,
      adjustedPrice: r.adjustedPrice,
      weight: r.weight,
      ageDays,
      distanceMi: c.distanceMi > 0 ? c.distanceMi : null,
      sqftDiffPct: subject.sqft > 0 && c.sqft > 0 ? (Math.abs(c.sqft - subject.sqft) / subject.sqft) * 100 : null,
      grossAdjPct: r.grossAdjPct,
      netAdjPct: c.salePrice > 0 ? (r.netAdj / c.salePrice) * 100 : 0,
      deviationPct,
      flags,
    };
  });

  const n = comps.length;
  const ages = comps.map((c) => c.ageDays).filter((x): x is number => x !== null && x >= 0);
  const dists = comps.map((c) => c.distanceMi).filter((x): x is number => x !== null);
  const prices = comps.map((c) => c.adjustedPrice);
  const cvPct = n >= 2 && mean(prices) > 0
    ? (Math.sqrt(mean(prices.map((p) => (p - mean(prices)) ** 2))) / mean(prices)) * 100
    : null;
  const spreadPct = a.count && a.median > 0 ? ((a.high - a.low) / a.median) * 100 : 0;
  const avgGross = n ? mean(comps.map((c) => c.grossAdjPct)) : null;

  const factors: Factor[] = [
    {
      key: "count", label: "Number of comparable sales",
      score: COUNT_SCORES[Math.min(n, 5)],
      value: `${n} comp${n === 1 ? "" : "s"} used`,
      rule: "Full marks at 5 or more; 3 is the usual minimum.",
    },
    {
      key: "recency", label: "How recently the comps sold",
      score: ages.length ? lin(median(ages), 90, 365) : null,
      value: ages.length ? `Median ${Math.round(median(ages))} days since sale (${ages.length} of ${n} dated)` : "No sale dates entered",
      rule: "Full marks at 90 days or less, falling to zero at 12 months.",
    },
    {
      key: "proximity", label: "How close the comps are",
      score: dists.length ? lin(mean(dists), 0.5, 3) : null,
      value: dists.length ? `Average ${mean(dists).toFixed(1)} mi (${dists.length} of ${n} entered)` : "No distances entered",
      rule: "Full marks at half a mile or less, falling to zero at 3 miles.",
    },
    {
      key: "similarity", label: "How little the comps needed adjusting",
      score: avgGross === null ? null : lin(avgGross, 10, 40),
      value: avgGross === null ? "No comps" : `Average gross adjustment ${avgGross.toFixed(1)}% of sale price`,
      rule: "Full marks at 10% or less, falling to zero at 40%.",
    },
    {
      key: "consistency", label: "How closely the adjusted prices agree",
      score: cvPct === null ? null : lin(cvPct, 3, 15),
      value: cvPct === null ? "Needs at least 2 comps" : `Adjusted prices vary by ${cvPct.toFixed(1)}% (standard deviation)`,
      rule: "Full marks at 3% or less, falling to zero at 15%.",
    },
  ];

  // Missing data counts as zero so that leaving fields blank can never raise the score.
  let score = Math.round(mean(factors.map((f) => f.score ?? 0)));
  const usingDefaultRates = (Object.keys(DEFAULT_RATES) as (keyof typeof DEFAULT_RATES)[]).every((k) => rates[k] === DEFAULT_RATES[k]);
  const caps: string[] = [];
  if (n < 3) { score = Math.min(score, 55); caps.push("Fewer than 3 comparable sales: capped at Limited."); }
  if (usingDefaultRates && !project.ratesBasis?.trim()) {
    score = Math.min(score, 79);
    caps.push("Adjustment rates are the app's placeholder defaults with no stated basis: capped at Moderate.");
  }

  const limitations: string[] = [];
  if (usingDefaultRates && !project.ratesBasis?.trim())
    limitations.push("The dollar adjustment rates have not been derived from market data. They drive every adjusted price, so the value is only as reliable as these rates.");
  else if (!project.ratesBasis?.trim())
    limitations.push("The basis for the adjustment rates was not recorded.");
  if (comps.some((c) => !c.source)) limitations.push(`${comps.filter((c) => !c.source).length} of ${n} comps have no recorded source, so their sale details cannot be independently checked from this report.`);
  if (ages.length < n) limitations.push(`${n - ages.length} of ${n} comps have no valid sale date.`);
  if (dists.length < n) limitations.push(`${n - dists.length} of ${n} comps have no distance entered.`);
  if (n < 3) limitations.push("Fewer than three comparable sales were used, which is thin support for a value range.");
  limitations.push("Condition, upgrades, lot, view and market-timing differences are only reflected through each comp's manual 'other adjustment'.");
  limitations.push("This is a comparative market analysis based on the data entered. It is not an appraisal and should not be used for lending decisions.");

  return {
    asOf: asOf.toISOString(),
    count: n, comps, factors, score, grade: gradeFor(score), caps, limitations,
    usingDefaultRates, spreadPct, cvPct,
  };
}
