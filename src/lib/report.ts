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

export type FactorKey = "count" | "recency" | "proximity" | "similarity" | "consistency";
export const FACTOR_KEYS: FactorKey[] = ["count", "recency", "proximity", "similarity", "consistency"];

export interface Factor {
  key: FactorKey;
  label: string;
  /** Share of the overall score this check carries, in percent. */
  weightPct: number;
  /** Raw weight the preparer set (0-10); 1 when untouched. */
  weight: number;
  /** 0-100, or null when the data needed to score it was not provided. */
  score: number | null;
  value: string;
  rule: string;
}

export type Grade = "High" | "Moderate" | "Limited" | "Low";

export interface TrendPoint { id: string; address: string; ts: number; ppsf: number }

export interface Trend {
  points: TrendPoint[];
  /** Change in sale price per sq ft, percent per month; null when there is too little data to fit a line. */
  slopePctPerMonth: number | null;
  /** Share of the variation in price per sq ft that the line explains (0-1). */
  r2: number | null;
  intercept: number | null;
  slopePerMs: number | null;
  note: string;
}

export interface Report {
  asOf: string;
  /** True when the preparer changed how much the five checks count. */
  customWeights: boolean;
  /** What the score would be with all five checks weighted equally (same caps applied). */
  equalWeightScore: number;
  equalWeightGrade: Grade;
  trend: Trend;
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

/** Normalise the preparer's weights: clamp to 0-10; blank = 1; all zero falls back to equal. */
export function resolveWeights(w: Project["checkWeights"]): Record<FactorKey, number> {
  const out = {} as Record<FactorKey, number>;
  for (const k of FACTOR_KEYS) {
    const v = w?.[k];
    out[k] = typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : 1;
  }
  return FACTOR_KEYS.every((k) => out[k] === 0) ? { count: 1, recency: 1, proximity: 1, similarity: 1, consistency: 1 } : out;
}

const MONTH_MS = 30.4375 * 86_400_000;

function buildTrend(rows: { comp: { id: string; address: string; salePrice: number; sqft: number; saleDate: string } }[], asOf: Date): Trend {
  const points: TrendPoint[] = rows
    .map((r) => ({ id: r.comp.id, address: r.comp.address || "Unnamed comp", ts: Date.parse(r.comp.saleDate), ppsf: r.comp.sqft > 0 ? r.comp.salePrice / r.comp.sqft : NaN }))
    .filter((p) => Number.isFinite(p.ts) && p.ts <= asOf.getTime() && Number.isFinite(p.ppsf) && p.ppsf > 0)
    .sort((a, b) => a.ts - b.ts);
  const empty = { slopePctPerMonth: null, r2: null, intercept: null, slopePerMs: null };
  if (points.length < 4) return { points, ...empty, note: `A trend line needs at least 4 dated comps (this report has ${points.length}).` };
  const span = points[points.length - 1].ts - points[0].ts;
  if (span < 60 * 86_400_000) return { points, ...empty, note: "The sales fall within two months of each other, which is too short to read a trend." };
  const xs = points.map((p) => p.ts - points[0].ts);
  const ys = points.map((p) => p.ppsf);
  const mx = mean(xs), my = mean(ys);
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  const ssRes = ys.reduce((s, y, i) => s + (y - (intercept + slope * xs[i])) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;
  return {
    points,
    slopePctPerMonth: ((slope * MONTH_MS) / my) * 100,
    r2,
    intercept,
    slopePerMs: slope,
    note: `Indicative only: a straight line through ${points.length} sales${r2 === null ? "" : ` explains ${Math.round(r2 * 100)}% of the variation in price per sq ft`}.`,
  };
}

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
      key: "count", weight: 1, weightPct: 20, label: "Number of comparable sales",
      score: COUNT_SCORES[Math.min(n, 5)],
      value: `${n} comp${n === 1 ? "" : "s"} used`,
      rule: "Full marks at 5 or more; 3 is the usual minimum.",
    },
    {
      key: "recency", weight: 1, weightPct: 20, label: "How recently the comps sold",
      score: ages.length ? lin(median(ages), 90, 365) : null,
      value: ages.length ? `Median ${Math.round(median(ages))} days since sale (${ages.length} of ${n} dated)` : "No sale dates entered",
      rule: "Full marks at 90 days or less, falling to zero at 12 months.",
    },
    {
      key: "proximity", weight: 1, weightPct: 20, label: "How close the comps are",
      score: dists.length ? lin(mean(dists), 0.5, 3) : null,
      value: dists.length ? `Average ${mean(dists).toFixed(1)} mi (${dists.length} of ${n} entered)` : "No distances entered",
      rule: "Full marks at half a mile or less, falling to zero at 3 miles.",
    },
    {
      key: "similarity", weight: 1, weightPct: 20, label: "How little the comps needed adjusting",
      score: avgGross === null ? null : lin(avgGross, 10, 40),
      value: avgGross === null ? "No comps" : `Average gross adjustment ${avgGross.toFixed(1)}% of sale price`,
      rule: "Full marks at 10% or less, falling to zero at 40%.",
    },
    {
      key: "consistency", weight: 1, weightPct: 20, label: "How closely the adjusted prices agree",
      score: cvPct === null ? null : lin(cvPct, 3, 15),
      value: cvPct === null ? "Needs at least 2 comps" : `Adjusted prices vary by ${cvPct.toFixed(1)}% (standard deviation)`,
      rule: "Full marks at 3% or less, falling to zero at 15%.",
    },
  ];

  const weights = resolveWeights(project.checkWeights);
  const totalW = FACTOR_KEYS.reduce((s, k) => s + weights[k], 0);
  for (const f of factors) { f.weight = weights[f.key]; f.weightPct = (weights[f.key] / totalW) * 100; }
  const customWeights = FACTOR_KEYS.some((k) => weights[k] !== 1);
  // Missing data counts as zero so that leaving fields blank can never raise the score.
  const weighted = (w: Record<FactorKey, number>) => {
    const t = FACTOR_KEYS.reduce((s, k) => s + w[k], 0);
    return factors.reduce((s, f) => s + (f.score ?? 0) * w[f.key], 0) / t;
  };
  let score = Math.round(weighted(weights));
  let equalWeightScore = Math.round(weighted({ count: 1, recency: 1, proximity: 1, similarity: 1, consistency: 1 }));
  const usingDefaultRates = (Object.keys(DEFAULT_RATES) as (keyof typeof DEFAULT_RATES)[]).every((k) => rates[k] === DEFAULT_RATES[k]);
  const caps: string[] = [];
  if (n < 3) { score = Math.min(score, 55); equalWeightScore = Math.min(equalWeightScore, 55); caps.push("Fewer than 3 comparable sales: capped at Limited."); }
  if (usingDefaultRates && !project.ratesBasis?.trim()) {
    score = Math.min(score, 79);
    equalWeightScore = Math.min(equalWeightScore, 79);
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
  const trend = buildTrend(a.rows, asOf);
  if (trend.slopePctPerMonth !== null && Math.abs(trend.slopePctPerMonth) >= 0.5 && (trend.r2 ?? 0) >= 0.5)
    limitations.push(`Prices per sq ft in these sales are ${trend.slopePctPerMonth > 0 ? "rising" : "falling"} about ${Math.abs(trend.slopePctPerMonth).toFixed(1)}% per month, but comps are not adjusted for date of sale. ${trend.slopePctPerMonth > 0 ? "Older comps may understate" : "Older comps may overstate"} current value.`);
  if (customWeights) limitations.push(`The five reliability checks were weighted by the preparer rather than equally. With equal weights the score would be ${equalWeightScore}/100 (${gradeFor(equalWeightScore)}).`);
  limitations.push("Condition, upgrades, lot, view and market-timing differences are only reflected through each comp's manual 'other adjustment'.");
  limitations.push("This is a comparative market analysis based on the data entered. It is not an appraisal and should not be used for lending decisions.");

  return {
    asOf: asOf.toISOString(),
    customWeights, equalWeightScore, equalWeightGrade: gradeFor(equalWeightScore),
    trend,
    count: n, comps, factors, score, grade: gradeFor(score), caps, limitations,
    usingDefaultRates, spreadPct, cvPct,
  };
}
