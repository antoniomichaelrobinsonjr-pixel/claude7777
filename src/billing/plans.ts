import type { Project } from "../lib/comps.ts";

/**
 * The membership tiers, in one place. Everything the app gates, prices or lists comes from here, so changing a limit
 * or a price is a one-line edit. Prices are US dollars in cents.
 *
 * Only features that are actually built are listed. Add a feature here when it ships, not before.
 */
export type PlanId = "starter" | "plus" | "pro" | "studio";
export type Interval = "week" | "month" | "year";

export const PLAN_IDS: PlanId[] = ["starter", "plus", "pro", "studio"];
export const INTERVALS: Interval[] = ["week", "month", "year"];

export type Feature =
  | "addressLookup"    // Locate addresses on the map and measure distances
  | "printSummary"     // Print / save the analysis as a PDF
  | "report"           // Open the investor report (value, comps, method, limitations)
  | "reportTrend"      // Price-per-sq-ft trend chart
  | "reportDistance"   // Distance-from-subject view
  | "reportGrade"      // Reliability grade, its five checks, and the per-comp flags
  | "reportMap"        // Map in the report
  | "reportWeights"    // Adjustable reliability weights
  | "brandedReport"    // "Prepared for / by" lines on the report
  | "csvExport"        // Download the comps and adjustments as CSV
  | "whiteLabel"       // Your own name and logo on the report
  | "prioritySupport"; // Faster replies from support (a service promise, not code)

export const FEATURES: Feature[] = [
  "addressLookup", "printSummary", "report", "reportTrend", "reportDistance", "reportGrade",
  "reportMap", "reportWeights", "brandedReport", "csvExport", "whiteLabel", "prioritySupport",
];

export interface Plan {
  id: PlanId;
  rank: number;
  /** Price in cents per interval; null = not sold on that interval (the free plan). */
  prices: Record<Interval, number | null>;
  /** null = unlimited */
  maxAnalyses: number | null;
  maxComps: number;
  features: Feature[];
}

const PLUS: Feature[] = ["addressLookup", "printSummary", "report", "reportTrend", "reportDistance"];
const PRO: Feature[] = [...PLUS, "reportGrade", "reportMap", "reportWeights", "brandedReport", "csvExport"];
const STUDIO: Feature[] = [...PRO, "whiteLabel", "prioritySupport"];

export const PLANS: Record<PlanId, Plan> = {
  starter: { id: "starter", rank: 0, prices: { week: null, month: null, year: null }, maxAnalyses: 2, maxComps: 4, features: [] },
  plus: { id: "plus", rank: 1, prices: { week: 400, month: 1200, year: 9900 }, maxAnalyses: null, maxComps: 8, features: PLUS },
  pro: { id: "pro", rank: 2, prices: { week: 900, month: 2900, year: 24900 }, maxAnalyses: null, maxComps: 15, features: PRO },
  studio: { id: "studio", rank: 3, prices: { week: 2400, month: 7900, year: 69900 }, maxAnalyses: null, maxComps: 40, features: STUDIO },
};

export const isPlanId = (x: unknown): x is PlanId => typeof x === "string" && (PLAN_IDS as string[]).includes(x);
export const isInterval = (x: unknown): x is Interval => typeof x === "string" && (INTERVALS as string[]).includes(x);

export const can = (plan: PlanId, feature: Feature) => PLANS[plan].features.includes(feature);

/** The cheapest plan that includes a feature. */
export function requiredPlan(feature: Feature): PlanId {
  return PLAN_IDS.find((p) => can(p, feature)) ?? "studio";
}

export const nextPlan = (plan: PlanId): PlanId | null => PLAN_IDS[PLAN_IDS.indexOf(plan) + 1] ?? null;

const WEEKS_PER_MONTH = 52 / 12;

/** What a plan costs per month on a given billing interval, for like-for-like comparison. */
export function monthlyEquivalentCents(plan: PlanId, interval: Interval): number | null {
  const p = PLANS[plan].prices[interval];
  if (p === null) return null;
  return interval === "week" ? p * WEEKS_PER_MONTH : interval === "year" ? p / 12 : p;
}

/** How much cheaper the yearly price is than twelve monthly payments, in percent. */
export function yearlySavingsPct(plan: PlanId): number | null {
  const m = PLANS[plan].prices.month, y = PLANS[plan].prices.year;
  return m === null || y === null ? null : Math.round((1 - y / (m * 12)) * 100);
}

/**
 * Apply a plan's comp limit without deleting anything. The limit counts every comp in the analysis (switched on or
 * not, the same rule the database enforces), so comps in positions beyond it stay saved but are left out of the value
 * until the person upgrades or removes some. Returns the same object when nothing changes.
 */
export function applyPlan(project: Project, plan: PlanId): Project {
  const max = PLANS[plan].maxComps;
  let changed = false;
  const comps = project.comps.map((c, i) => {
    if (i < max || !c.included) return c;
    changed = true;
    return { ...c, included: false };
  });
  return changed ? { ...project, comps } : project;
}

/** How many switched-on comps are being held back by the plan limit. */
export function lockedCompCount(project: Project, plan: PlanId): number {
  return project.comps.filter((c) => c.included).length - applyPlan(project, plan).comps.filter((c) => c.included).length;
}

export const canCreateAnalysis = (plan: PlanId, existing: number) => {
  const max = PLANS[plan].maxAnalyses;
  return max === null || existing < max;
};

/** A comp can be added while the analysis has fewer comps than the plan allows. */
export const canAddComp = (plan: PlanId, compCount: number) => compCount < PLANS[plan].maxComps;

/**
 * Every paid plan comes with a free trial, once per plan per account, so people can see what each tier does with their
 * own comps. The strings that mention it ("7-day", "7 days") are written out in every language; a test keeps them in
 * step with this number.
 */
export const TRIAL_DAYS = 7;

/** Whether this account can still start the free trial of a paid plan. `used` is the plans it has already tried. */
export const trialEligible = (plan: PlanId, used: readonly string[] | null | undefined) => plan !== "starter" && !(used ?? []).includes(plan);
