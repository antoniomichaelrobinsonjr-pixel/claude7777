import { analyze, defaultRatesFor, isLand, type GeoPoint, type Project } from "./comps.ts";
import { haversineMiles, validGeo } from "./geo.ts";
import { msg, n as num, type Msg } from "../i18n/format.ts";

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
  /** Straight-line distance from the geocoded addresses, when both were located. */
  mapDistanceMi: number | null;
  geo: GeoPoint | null;
  distanceComputed: boolean;
  sqftDiffPct: number | null;
  grossAdjPct: number;
  netAdjPct: number;
  /** How far the adjusted price sits from the median adjusted price. */
  deviationPct: number;
  /** Things a careful reader should know about this comp, as translatable messages. */
  flags: Msg[];
}

export type FactorKey = "count" | "recency" | "proximity" | "similarity" | "consistency";
export const FACTOR_KEYS: FactorKey[] = ["count", "recency", "proximity", "similarity", "consistency"];

export interface Factor {
  key: FactorKey;
  /** Share of the overall score this check carries, in percent. */
  weightPct: number;
  /** Raw weight the preparer set (0-10); 1 when untouched. */
  weight: number;
  /** 0-100, or null when the data needed to score it was not provided. */
  score: number | null;
  /** What was measured, as a translatable message. Labels and rules are looked up by factor key. */
  value: Msg;
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
  note: Msg;
}

export type DistanceBasis = "map" | "entered" | "mixed" | "none";

export interface Report {
  asOf: string;
  subjectGeo: GeoPoint | null;
  /** Number of comps that have a valid located address. */
  mapped: number;
  distanceBasis: DistanceBasis;
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
  caps: Msg[];
  /** Plain statements about what the estimate does and does not rest on. */
  limitations: Msg[];
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

function buildTrend(rows: { comp: { id: string; address: string; salePrice: number; sqft: number; saleDate: string } }[], asOf: Date, prefix = ""): Trend {
  const points: TrendPoint[] = rows
    .map((r) => ({ id: r.comp.id, address: r.comp.address, ts: Date.parse(r.comp.saleDate), ppsf: r.comp.sqft > 0 ? r.comp.salePrice / r.comp.sqft : NaN }))
    .filter((p) => Number.isFinite(p.ts) && p.ts <= asOf.getTime() && Number.isFinite(p.ppsf) && p.ppsf > 0)
    .sort((a, b) => a.ts - b.ts);
  const empty = { slopePctPerMonth: null, r2: null, intercept: null, slopePerMs: null };
  if (points.length < 4) return { points, ...empty, note: msg("trend.note.tooFew", { count: points.length }) };
  const span = points[points.length - 1].ts - points[0].ts;
  if (span < 60 * 86_400_000) return { points, ...empty, note: msg("trend.note.short") };
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
    note: r2 === null ? msg("trend.note.fitNoR2", { count: points.length }) : msg(`${prefix}trend.note.fit`, { count: points.length, pct: num.pct0(r2 * 100) }),
  };
}

export function buildReport(project: Project, asOf: Date = new Date()): Report {
  const a = analyze(project);
  const { subject, rates } = project;
  const landPrefix = isLand(subject) ? "land." : "";
  const med = a.count ? median(a.rows.map((r) => r.adjustedPrice)) : 0;

  const subjectGeo = validGeo(subject.geo, subject.address);
  const comps: CompEvidence[] = a.rows.map((r) => {
    const c = r.comp;
    const geo = validGeo(c.geo, c.address);
    const mapDistanceMi = subjectGeo && geo ? haversineMiles(subjectGeo, geo) : null;
    const t = c.saleDate ? Date.parse(c.saleDate) : NaN;
    const ageDays = Number.isFinite(t) ? Math.floor((asOf.getTime() - t) / 86_400_000) : null;
    const flags: Msg[] = [];
    if (ageDays === null) flags.push(msg("flag.noDate"));
    else if (ageDays < 0) flags.push(msg("flag.future"));
    else if (ageDays > 180) flags.push(msg("flag.old"));
    const entered = c.distanceMi > 0 ? c.distanceMi : null;
    // A straight line is the shortest possible route, so when the map gives a distance the larger of the two is used.
    const distance = mapDistanceMi !== null ? Math.max(entered ?? 0, mapDistanceMi) : entered;
    if (distance === null) flags.push(msg("flag.noDist"));
    else if (distance > 1) flags.push(msg("flag.far"));
    if (mapDistanceMi !== null && entered !== null && !c.distanceComputed && mapDistanceMi - entered > 0.25)
      flags.push(msg("flag.shorter", { entered: num.dec1(entered), map: num.dec1(mapDistanceMi) }));
    if (geo && !geo.precise) flags.push(msg("flag.areaOnly"));
    if (!c.source?.trim()) flags.push(msg("flag.noSource"));
    if (r.grossAdjPct > 25) flags.push(msg("flag.heavy"));
    const deviationPct = med > 0 ? ((r.adjustedPrice - med) / med) * 100 : 0;
    if (a.count >= 3 && Math.abs(deviationPct) > 10) flags.push(msg("flag.outlier"));
    return {
      id: c.id,
      address: c.address,
      source: c.source?.trim() ?? "",
      salePrice: c.salePrice,
      adjustedPrice: r.adjustedPrice,
      weight: r.weight,
      ageDays,
      distanceMi: distance,
      mapDistanceMi,
      geo,
      distanceComputed: !!c.distanceComputed && c.distanceMi > 0,
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

  const withDistance = comps.filter((c) => c.distanceMi !== null);
  const mapBacked = withDistance.filter((c) => c.mapDistanceMi !== null).length;
  const distanceBasis: DistanceBasis = withDistance.length === 0 ? "none" : mapBacked === withDistance.length ? "map" : mapBacked === 0 ? "entered" : "mixed";
  const mapped = comps.filter((c) => c.geo).length;

  const factors: Factor[] = [
    {
      key: "count", weight: 1, weightPct: 20,
      score: COUNT_SCORES[Math.min(n, 5)],
      value: msg("factor.count.value", { count: n }),
    },
    {
      key: "recency", weight: 1, weightPct: 20,
      score: ages.length ? lin(median(ages), 90, 365) : null,
      value: ages.length ? msg("factor.recency.value", { days: num.int(median(ages)), dated: ages.length, total: n }) : msg("factor.recency.none"),
    },
    {
      key: "proximity", weight: 1, weightPct: 20,
      score: dists.length ? lin(mean(dists), 0.5, 3) : null,
      value: dists.length
        ? msg(distanceBasis === "map" ? "factor.proximity.valueMap" : "factor.proximity.valueEntered", { miles: num.dec1(mean(dists)), k: dists.length, total: n })
        : msg("factor.proximity.none"),
    },
    {
      key: "similarity", weight: 1, weightPct: 20,
      score: avgGross === null ? null : lin(avgGross, 10, 40),
      value: avgGross === null ? msg("factor.similarity.none") : msg("factor.similarity.value", { pct: num.pct1(avgGross) }),
    },
    {
      key: "consistency", weight: 1, weightPct: 20,
      score: cvPct === null ? null : lin(cvPct, 3, 15),
      value: cvPct === null ? msg("factor.consistency.none") : msg("factor.consistency.value", { pct: num.pct1(cvPct) }),
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
  const defaults = defaultRatesFor(subject);
  const usingDefaultRates = (Object.keys(defaults) as (keyof typeof defaults)[]).every((k) => rates[k] === defaults[k]);
  const caps: Msg[] = [];
  if (n < 3) { score = Math.min(score, 55); equalWeightScore = Math.min(equalWeightScore, 55); caps.push(msg("cap.fewComps")); }
  if (usingDefaultRates && !project.ratesBasis?.trim()) {
    score = Math.min(score, 79);
    equalWeightScore = Math.min(equalWeightScore, 79);
    caps.push(msg("cap.rates"));
  }

  const limitations: Msg[] = [];
  if (usingDefaultRates && !project.ratesBasis?.trim()) limitations.push(msg("lim.ratesDefault"));
  else if (!project.ratesBasis?.trim()) limitations.push(msg("lim.ratesNoBasis"));
  const unsourced = comps.filter((c) => !c.source).length;
  if (unsourced > 0) limitations.push(msg("lim.noSource", { count: unsourced, total: n }));
  if (ages.length < n) limitations.push(msg("lim.noDate", { count: n - ages.length, total: n }));
  if (dists.length < n) limitations.push(msg("lim.noDist", { count: n - dists.length, total: n }));
  if (n < 3) limitations.push(msg("lim.fewComps"));
  if (mapped > 0 || subjectGeo) {
    if (!subjectGeo) limitations.push(msg("lim.subjectNotLocated"));
    if (mapped < n) limitations.push(msg("lim.notOnMap", { count: n - mapped, total: n }));
    if (comps.some((c) => c.geo && !c.geo.precise)) limitations.push(msg("lim.areaMatches"));
  }
  const trend = buildTrend(a.rows, asOf, landPrefix);
  if (trend.slopePctPerMonth !== null && Math.abs(trend.slopePctPerMonth) >= 0.5 && (trend.r2 ?? 0) >= 0.5)
    limitations.push(msg(`${landPrefix}${trend.slopePctPerMonth > 0 ? "lim.trendRising" : "lim.trendFalling"}`, { pct: num.dec1(Math.abs(trend.slopePctPerMonth)) }));
  if (customWeights) limitations.push(msg("lim.customWeights", { score: equalWeightScore, grade: gradeFor(equalWeightScore) }));
  limitations.push(msg("lim.timing"));
  limitations.push(msg("lim.notAppraisal"));

  return {
    asOf: asOf.toISOString(),
    subjectGeo, mapped, distanceBasis,
    customWeights, equalWeightScore, equalWeightGrade: gradeFor(equalWeightScore),
    trend,
    count: n, comps, factors, score, grade: gradeFor(score), caps, limitations,
    usingDefaultRates, spreadPct, cvPct,
  };
}
