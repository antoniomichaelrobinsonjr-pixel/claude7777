import { INTERVALS, PLAN_IDS, isInterval, isPlanId, type Interval, type PlanId } from "./plans.ts";

/** Names of the environment variables holding the nine Stripe Price ids, e.g. STRIPE_PRICE_PRO_MONTH. */
export const priceEnvName = (plan: PlanId, interval: Interval) => `STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`;

export type Env = Record<string, string | undefined>;

export function priceIdFor(plan: PlanId, interval: Interval, env: Env): string | null {
  return env[priceEnvName(plan, interval)]?.trim() || null;
}

/** Which plan and billing interval a Stripe Price id belongs to, or null if it is not one of ours. */
export function planFromPriceId(priceId: string, env: Env): { plan: PlanId; interval: Interval } | null {
  for (const plan of PLAN_IDS) {
    if (plan === "starter") continue;
    for (const interval of INTERVALS) if (priceIdFor(plan, interval, env) === priceId) return { plan, interval };
  }
  return null;
}

/** Subscription states that keep paid access. `past_due` keeps it while Stripe retries the card. */
export const ACCESS_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface SubscriptionLike {
  id: string;
  status: string;
  customer: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  items: { data: { current_period_end?: number; price: { id: string; recurring?: { interval?: string } | null } }[] };
  metadata?: Record<string, string> | null;
}

export interface Profile {
  user_id: string;
  plan: PlanId;
  interval: Interval | null;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  last_event_at: number;
}
export type ProfilePatch = Omit<Profile, "user_id">;

/**
 * Turn a Stripe subscription into the plan someone should have. Unknown prices, or a price whose billing interval
 * disagrees with our configuration, grant nothing: a misconfiguration must never hand out paid access.
 */
export function patchFromSubscription(sub: SubscriptionLike, env: Env, eventCreated: number): ProfilePatch | null {
  const item = sub.items?.data?.[0];
  if (!item) return null;
  const mapped = planFromPriceId(item.price.id, env);
  if (!mapped) return null;
  const recurring = item.price.recurring?.interval;
  if (recurring && recurring !== mapped.interval) return null;
  const end = sub.current_period_end ?? item.current_period_end;
  return {
    plan: ACCESS_STATUSES.has(sub.status) ? mapped.plan : "starter",
    interval: mapped.interval,
    status: sub.status,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    current_period_end: typeof end === "number" ? new Date(end * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    last_event_at: eventCreated,
  };
}

/** Stripe can deliver events late or out of order; never let an older one overwrite a newer one. */
export const isNewerOrEqual = (existingLastEventAt: number | null | undefined, eventCreated: number) =>
  existingLastEventAt == null || eventCreated >= existingLastEventAt;

// ---- checkout requests -------------------------------------------------------------------------

export type CheckoutRequestError = "invalid_plan" | "invalid_interval" | "not_configured";

export function parseCheckoutRequest(body: unknown, env: Env):
  | { ok: true; plan: PlanId; interval: Interval; priceId: string }
  | { ok: false; error: CheckoutRequestError } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (!isPlanId(b.plan) || b.plan === "starter") return { ok: false, error: "invalid_plan" };
  if (!isInterval(b.interval)) return { ok: false, error: "invalid_interval" };
  const priceId = priceIdFor(b.plan, b.interval, env);
  return priceId ? { ok: true, plan: b.plan, interval: b.interval, priceId } : { ok: false, error: "not_configured" };
}

export interface CheckoutInput {
  priceId: string;
  plan: PlanId;
  interval: Interval;
  userId: string;
  email?: string | null;
  customerId?: string | null;
  siteUrl: string;
  env: Env;
}

/** The parameters for Stripe's Checkout Session; kept pure so they can be tested without calling Stripe. */
export function buildCheckoutParams(i: CheckoutInput) {
  const meta = { user_id: i.userId, plan: i.plan, interval: i.interval };
  return {
    mode: "subscription" as const,
    line_items: [{ price: i.priceId, quantity: 1 }],
    client_reference_id: i.userId,
    ...(i.customerId ? { customer: i.customerId } : i.email ? { customer_email: i.email } : {}),
    success_url: `${i.siteUrl}/pricing?checkout=success`,
    cancel_url: `${i.siteUrl}/pricing?checkout=cancelled`,
    allow_promotion_codes: true,
    billing_address_collection: "auto" as const,
    metadata: meta,
    subscription_data: { metadata: meta },
    ...(i.env.STRIPE_AUTOMATIC_TAX === "1" ? { automatic_tax: { enabled: true } } : {}),
    ...(i.env.STRIPE_REQUIRE_TERMS === "1" ? { consent_collection: { terms_of_service: "required" as const } } : {}),
  };
}
