import { can, type PlanId } from "../billing/plans.ts";
import { ACCESS_STATUSES } from "../billing/stripe-map.ts";
import type { IndexPoint } from "./series.ts";
import { refreshMarket, type RefreshDeps } from "./refresh.ts";

export interface HttpResult { status: number; body: Record<string, unknown> }
const fail = (status: number, error: string): HttpResult => ({ status, body: { error } });

export interface MarketReadDeps {
  billingEnabled: boolean;
  /** Null when there is no signed-in user. */
  user: { id: string } | null;
  country: string | null;
  loadPlan(userId: string): Promise<{ plan: PlanId; status: string } | null>;
  load(country: string): Promise<{ series: IndexPoint[]; fetchedAt: string; source: string } | null>;
  meta(): Promise<{ fetchedAt: string; source: string } | null>;
}

/** The daily market data is a paid feature when billing is on; with billing off it is open like everything else. */
export async function processMarketRead(d: MarketReadDeps): Promise<HttpResult> {
  const code = (d.country ?? "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return fail(400, "invalid_country");
  if (d.billingEnabled) {
    if (!d.user) return fail(401, "sign_in_required");
    const p = await d.loadPlan(d.user.id);
    const plan: PlanId = p && ACCESS_STATUSES.has(p.status) ? p.plan : "starter";
    if (!can(plan, "marketUpdates")) return fail(403, "plan_required");
  }
  const row = await d.load(code);
  if (!row) return { status: 200, body: { country: code, available: false, updatedAt: (await d.meta())?.fetchedAt ?? null } };
  return { status: 200, body: { country: code, available: true, series: row.series, updatedAt: row.fetchedAt, source: row.source } };
}

/** Constant-time string comparison for the scheduler's secret. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function processMarketRefresh(authorization: string | null, secret: string | undefined, deps: RefreshDeps): Promise<HttpResult> {
  if (!secret) return fail(503, "cron_not_configured");
  const given = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeEqual(given, secret)) return fail(401, "unauthorized");
  try {
    return { status: 200, body: { ok: true, ...(await refreshMarket(deps)) } };
  } catch (e) {
    // The old data stays in place; the scheduler (and whoever watches it) sees the failure.
    return fail(502, e instanceof Error ? e.message : "refresh_failed");
  }
}
