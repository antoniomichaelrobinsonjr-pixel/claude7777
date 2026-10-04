import { isLand, type Analysis, type Project } from "./comps.ts";
import { driftSince, latestPoint, periodOf, type IndexPoint } from "../market/series.ts";

/**
 * The maths behind the seller, buyer and ownership reports. Pure and deterministic so it can be tested without a
 * browser. None of it is an appraisal: it restates what the comparable sales say and shows the arithmetic.
 */

export type Position = "belowRange" | "lowerHalf" | "upperHalf" | "aboveRange";

/** Where a price sits against the range the comps support. */
export function positionOf(price: number, a: Pick<Analysis, "low" | "weighted" | "high">): Position {
  if (price < a.low) return "belowRange";
  if (price <= a.weighted) return "lowerHalf";
  if (price <= a.high) return "upperHalf";
  return "aboveRange";
}

/** Percent difference of a price from a reference (positive = above it). Null when the reference isn't usable. */
export const pctFrom = (price: number, reference: number): number | null => (reference > 0 ? (price / reference - 1) * 100 : null);

export interface Costs { agentPct: number; otherPct: number; payoff: number }
const clampPct = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(100, x)) : 0);
const money = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);

/** What a seller would be left with: price, minus percentage costs, minus any loan payoff. Can be negative. */
export function netProceeds(price: number, c: Costs | undefined): number {
  const costs = c ?? { agentPct: 0, otherPct: 0, payoff: 0 };
  const pct = clampPct(costs.agentPct) + clampPct(costs.otherPct);
  return price - (price * Math.min(100, pct)) / 100 - money(costs.payoff);
}

/** The comps that carry the most weight, which is what a buyer or appraiser will look at first. */
export function closestComps(a: Analysis, limit = 3) {
  return [...a.rows].sort((x, y) => y.weight - x.weight).slice(0, limit);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((p, q) => p - q);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Median sale price per unit of size (per sq ft, or per acre for land) across the comps used. Null with no usable comps. */
export function medianPerUnit(a: Analysis): number | null {
  const v = a.rows.filter((r) => r.comp.sqft > 0).map((r) => r.comp.salePrice / r.comp.sqft);
  return v.length ? median(v) : null;
}

/** A price expressed per unit of the subject's size. Null when the size is missing. */
export const perUnit = (price: number, project: Pick<Project, "subject">): number | null =>
  project.subject.sqft > 0 && price > 0 ? price / project.subject.sqft : null;

export interface BuyerView {
  asking: number;
  vsWeightedPct: number | null;
  position: Position;
  /** Dollars the asking price is above the weighted value; 0 when it is at or below it. */
  roomToNegotiate: number;
  askingPerUnit: number | null;
  compsPerUnit: number | null;
  perUnitVsCompsPct: number | null;
  land: boolean;
}

export function buyerView(project: Project, a: Analysis): BuyerView | null {
  const asking = project.askingPrice ?? 0;
  if (!(asking > 0) || a.count === 0) return null;
  const askingPerUnit = perUnit(asking, project);
  const compsPerUnit = medianPerUnit(a);
  return {
    asking,
    vsWeightedPct: pctFrom(asking, a.weighted),
    position: positionOf(asking, a),
    roomToNegotiate: Math.max(0, asking - a.weighted),
    askingPerUnit, compsPerUnit,
    perUnitVsCompsPct: askingPerUnit !== null && compsPerUnit !== null ? pctFrom(askingPerUnit, compsPerUnit) : null,
    land: isLand(project.subject),
  };
}

export interface SellerView {
  list: number | null;
  position: Position | null;
  vsWeightedPct: number | null;
  /** Net proceeds at the low end, the weighted value, the high end and the list price (when entered). */
  net: { low: number; weighted: number; high: number; list: number | null };
  hasCosts: boolean;
  land: boolean;
}

export function sellerView(project: Project, a: Analysis): SellerView | null {
  if (a.count === 0) return null;
  const list = (project.askingPrice ?? 0) > 0 ? project.askingPrice! : null;
  const c = project.sellerCosts;
  return {
    list,
    position: list === null ? null : positionOf(list, a),
    vsWeightedPct: list === null ? null : pctFrom(list, a.weighted),
    net: { low: netProceeds(a.low, c), weighted: netProceeds(a.weighted, c), high: netProceeds(a.high, c), list: list === null ? null : netProceeds(list, c) },
    hasCosts: !!c && (clampPct(c.agentPct) > 0 || clampPct(c.otherPct) > 0 || money(c.payoff) > 0),
    land: isLand(project.subject),
  };
}

// ---- ownership ------------------------------------------------------------------------------------------------

export interface OwnerSummary {
  years: number;
  gain: number;
  gainPct: number;
  /** Compound yearly growth from purchase price to today's value; null when held under a year (too noisy to annualise). */
  cagrPct: number | null;
  /** Gain after subtracting money put into improvements; null when none was entered. */
  gainAfterImprovements: number | null;
}

const YEAR_MS = 365.25 * 86_400_000;

export function ownerSummary(o: Project["ownership"], today: number, asOf: Date): OwnerSummary | null {
  if (!o || !(o.purchasePrice > 0) || !(today > 0)) return null;
  const t = Date.parse(o.purchaseDate);
  if (!Number.isFinite(t) || t > asOf.getTime()) return null;
  const years = (asOf.getTime() - t) / YEAR_MS;
  const imp = money(o.improvements);
  return {
    years,
    gain: today - o.purchasePrice,
    gainPct: (today / o.purchasePrice - 1) * 100,
    cagrPct: years >= 1 ? ((today / o.purchasePrice) ** (1 / years) - 1) * 100 : null,
    gainAfterImprovements: imp > 0 ? today - o.purchasePrice - imp : null,
  };
}

export interface PathPoint { ts: number; period: string; value: number; kind: "purchase" | "anniversary" | "today" }

export interface MarketPath {
  points: PathPoint[];
  /** What the purchase price would be worth today if the property had simply tracked the national index. */
  expectedToday: number | null;
  /** How far today's indicated value is above (+) or below (−) that, in percent. */
  vsMarketPct: number | null;
}

const indexAt = (s: IndexPoint[], period: string) => s.find((p) => p.period === period)?.value ?? null;

/**
 * Walk back from today's value using the country's price index: what today's value would have been at each
 * anniversary if the property had moved with the market. It also shows whether the property did better or worse than
 * the market since purchase. Quarterly data, so each point is "within the quarter".
 */
export function marketPath(series: IndexPoint[], today: number, o: Project["ownership"], asOf: Date): MarketPath | null {
  const last = latestPoint(series);
  if (!last || !o || !(today > 0) || !(o.purchasePrice > 0)) return null;
  const start = Date.parse(o.purchaseDate);
  if (!Number.isFinite(start) || start > asOf.getTime()) return null;
  const points: PathPoint[] = [];
  const add = (ts: number, kind: PathPoint["kind"]) => {
    const iso = new Date(ts).toISOString().slice(0, 10);
    const period = kind === "today" ? last.period : periodOf(iso);
    const idx = period ? indexAt(series, period) : null;
    if (period && idx !== null) points.push({ ts, period, value: (today * idx) / last.value, kind });
  };
  add(start, "purchase");
  const s = new Date(start);
  for (let y = 1; ; y++) {
    const ts = Date.UTC(s.getUTCFullYear() + y, s.getUTCMonth(), s.getUTCDate());
    if (ts >= asOf.getTime()) break;
    add(ts, "anniversary");
  }
  add(asOf.getTime(), "today");
  const purchasePeriod = periodOf(new Date(start).toISOString().slice(0, 10));
  const idxThen = purchasePeriod ? indexAt(series, purchasePeriod) : null;
  const expectedToday = idxThen !== null ? (o.purchasePrice * last.value) / idxThen : null;
  return { points, expectedToday, vsMarketPct: expectedToday ? (today / expectedToday - 1) * 100 : null };
}

/** The country's compound yearly growth over the last `years` years of the index, or null when the series is too short. */
export function trailingCagr(series: IndexPoint[], years = 5): number | null {
  const last = latestPoint(series);
  if (!last) return null;
  const [y, q] = last.period.split("-Q").map(Number);
  const earlier = indexAt(series, `${y - years}-Q${q}`);
  return earlier === null ? null : ((last.value / earlier) ** (1 / years) - 1) * 100;
}

export const DEFAULT_GROWTH: [number, number, number] = [0, 3, 6];

export interface ProjectionRow { year: number; values: [number, number, number] }

/** Scenario values for years 0..n at three yearly growth rates. An illustration of the arithmetic, not a forecast. */
export function projection(today: number, ratesPct: readonly [number, number, number], years: number): ProjectionRow[] {
  const r = ratesPct.map((x) => (Number.isFinite(x) ? Math.max(-50, Math.min(50, x)) : 0));
  const n = Math.max(0, Math.min(40, Math.floor(years)));
  return Array.from({ length: n + 1 }, (_, y) => ({ year: y, values: r.map((g) => today * (1 + g / 100) ** y) as [number, number, number] }));
}

export { driftSince };
