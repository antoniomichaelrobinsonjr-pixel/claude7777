import { buildCheckoutParams, parseCheckoutRequest, type Env, type Profile } from "./stripe-map.ts";
import { handleStripeEvent, type StripeEventLike, type WebhookDeps } from "./webhook.ts";
import { ACCESS_STATUSES } from "./stripe-map.ts";

export interface HttpResult { status: number; body: Record<string, unknown> }
const fail = (status: number, error: string): HttpResult => ({ status, body: { error } });

export interface AuthedUser { id: string; email?: string | null }

// ---- create a checkout session ----------------------------------------------------------------
export interface CheckoutDeps {
  env: Env;
  siteUrl: string;
  user: AuthedUser | null;
  body: unknown;
  loadProfile(userId: string): Promise<Pick<Profile, "stripe_customer_id" | "status" | "plan"> | null>;
  createSession(params: ReturnType<typeof buildCheckoutParams>): Promise<{ url: string | null }>;
}

export async function processCheckout(d: CheckoutDeps): Promise<HttpResult> {
  if (d.env.NEXT_PUBLIC_BILLING_ENABLED !== "true") return fail(503, "billing_disabled");
  if (!d.user) return fail(401, "sign_in_required");
  const req = parseCheckoutRequest(d.body, d.env);
  if (!req.ok) return fail(req.error === "not_configured" ? 503 : 400, req.error);
  const profile = await d.loadProfile(d.user.id);
  // One active subscription per person: plan changes and cancellations go through the billing portal, so nobody is billed twice.
  if (profile && ACCESS_STATUSES.has(profile.status) && profile.plan !== "starter") return fail(409, "already_subscribed");
  const session = await d.createSession(buildCheckoutParams({
    priceId: req.priceId, plan: req.plan, interval: req.interval, userId: d.user.id,
    email: d.user.email, customerId: profile?.stripe_customer_id ?? null, siteUrl: d.siteUrl, env: d.env,
  }));
  return session.url ? { status: 200, body: { url: session.url } } : fail(502, "no_checkout_url");
}

// ---- open the billing portal --------------------------------------------------------------------
export interface PortalDeps {
  env: Env;
  siteUrl: string;
  user: AuthedUser | null;
  loadProfile(userId: string): Promise<Pick<Profile, "stripe_customer_id"> | null>;
  createPortal(customerId: string, returnUrl: string): Promise<{ url: string }>;
}

export async function processPortal(d: PortalDeps): Promise<HttpResult> {
  if (d.env.NEXT_PUBLIC_BILLING_ENABLED !== "true") return fail(503, "billing_disabled");
  if (!d.user) return fail(401, "sign_in_required");
  const profile = await d.loadProfile(d.user.id);
  if (!profile?.stripe_customer_id) return fail(404, "no_subscription");
  const portal = await d.createPortal(profile.stripe_customer_id, `${d.siteUrl}/pricing`);
  return { status: 200, body: { url: portal.url } };
}

// ---- Stripe webhook ----------------------------------------------------------------------------
export interface WebhookHttpDeps extends WebhookDeps {
  secret: string | undefined;
  constructEvent(rawBody: string, signature: string, secret: string): StripeEventLike;
}

export async function processWebhook(rawBody: string, signature: string | null, d: WebhookHttpDeps): Promise<HttpResult> {
  if (!d.secret) return fail(503, "webhook_not_configured");
  if (!signature) return fail(400, "missing_signature");
  let event: StripeEventLike;
  try {
    event = d.constructEvent(rawBody, signature, d.secret);
  } catch {
    return fail(400, "invalid_signature");
  }
  try {
    const result = await handleStripeEvent(event, d);
    return { status: 200, body: { received: true, ...result } };
  } catch {
    // Non-2xx makes Stripe retry later, which is what we want for a temporary database or network failure.
    return fail(500, "processing_failed");
  }
}
