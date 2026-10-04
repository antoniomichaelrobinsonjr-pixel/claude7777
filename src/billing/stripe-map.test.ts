import { test } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { buildCheckoutParams, isNewerOrEqual, parseCheckoutRequest, patchFromSubscription, planFromPriceId, priceEnvName, priceIdFor, type Profile, type SubscriptionLike } from "./stripe-map.ts";
import { handleStripeEvent, type StripeEventLike, type WebhookDeps } from "./webhook.ts";
import { INTERVALS, PLAN_IDS } from "./plans.ts";

const env: Record<string, string> = {};
for (const p of PLAN_IDS) if (p !== "starter") for (const i of INTERVALS) env[priceEnvName(p, i)] = `price_${p}_${i}`;

const sub = (o: Partial<SubscriptionLike> & { price?: string; interval?: string } = {}): SubscriptionLike => {
  const { price, interval, ...rest } = o;
  return {
    id: "sub_1", status: "active", customer: "cus_1", current_period_end: 1_800_000_000, cancel_at_period_end: false,
    items: { data: [{ price: { id: price ?? "price_pro_month", recurring: { interval: interval ?? "month" } } }] },
    metadata: { user_id: "user-1" }, ...rest,
  };
};

test("price env names and lookups round-trip for all nine paid prices", () => {
  assert.equal(priceEnvName("pro", "month"), "STRIPE_PRICE_PRO_MONTH");
  assert.equal(priceEnvName("plus", "week"), "STRIPE_PRICE_PLUS_WEEK");
  let n = 0;
  for (const p of PLAN_IDS) if (p !== "starter") for (const i of INTERVALS) {
    const id: string = priceIdFor(p, i, env)!;
    assert.deepEqual(planFromPriceId(id, env), { plan: p, interval: i });
    n++;
  }
  assert.equal(n, 9);
  assert.equal(planFromPriceId("price_unknown", env), null);
  assert.equal(priceIdFor("pro", "month", {}), null);
  assert.equal(priceIdFor("pro", "month", { STRIPE_PRICE_PRO_MONTH: "  " }), null);
});

test("subscription status decides access: active, trialing and past_due keep the plan; others fall to starter", () => {
  for (const status of ["active", "trialing", "past_due"]) assert.equal(patchFromSubscription(sub({ status }), env, 10)!.plan, "pro", status);
  for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) assert.equal(patchFromSubscription(sub({ status }), env, 10)!.plan, "starter", status);
});

test("patch carries interval, customer, subscription, period end and cancel flag", () => {
  const p = patchFromSubscription(sub({ cancel_at_period_end: true }), env, 42)!;
  assert.equal(p.interval, "month");
  assert.equal(p.stripe_customer_id, "cus_1");
  assert.equal(p.stripe_subscription_id, "sub_1");
  assert.equal(p.current_period_end, new Date(1_800_000_000 * 1000).toISOString());
  assert.equal(p.cancel_at_period_end, true);
  assert.equal(p.last_event_at, 42);
});

test("period end is also read from the item (newer Stripe API versions)", () => {
  const s = sub();
  delete s.current_period_end;
  s.items.data[0].current_period_end = 1_900_000_000;
  assert.equal(patchFromSubscription(s, env, 1)!.current_period_end, new Date(1_900_000_000 * 1000).toISOString());
});

test("a misconfiguration never grants access: unknown price, or interval that disagrees with config", () => {
  assert.equal(patchFromSubscription(sub({ price: "price_mystery" }), env, 1), null);
  assert.equal(patchFromSubscription(sub({ interval: "year" }), env, 1), null); // price_pro_month billed yearly in Stripe
  const empty = sub(); empty.items.data = [];
  assert.equal(patchFromSubscription(empty, env, 1), null);
});

test("weekly and yearly prices map to their own plan and interval", () => {
  assert.equal(patchFromSubscription(sub({ price: "price_studio_week", interval: "week" }), env, 1)!.interval, "week");
  assert.equal(patchFromSubscription(sub({ price: "price_plus_year", interval: "year" }), env, 1)!.plan, "plus");
});

test("events older than the stored state are ignored", () => {
  assert.equal(isNewerOrEqual(null, 5), true);
  assert.equal(isNewerOrEqual(10, 10), true);
  assert.equal(isNewerOrEqual(10, 9), false);
});

// ---- checkout requests ----
test("checkout request: only paid plans on real intervals with a configured price", () => {
  assert.deepEqual(parseCheckoutRequest({ plan: "pro", interval: "month" }, env), { ok: true, plan: "pro", interval: "month", priceId: "price_pro_month" });
  assert.deepEqual(parseCheckoutRequest({ plan: "starter", interval: "month" }, env), { ok: false, error: "invalid_plan" });
  assert.deepEqual(parseCheckoutRequest({ plan: "gold", interval: "month" }, env), { ok: false, error: "invalid_plan" });
  assert.deepEqual(parseCheckoutRequest({ plan: "pro", interval: "day" }, env), { ok: false, error: "invalid_interval" });
  assert.deepEqual(parseCheckoutRequest({ plan: "pro", interval: "month" }, {}), { ok: false, error: "not_configured" });
  assert.deepEqual(parseCheckoutRequest(null, env), { ok: false, error: "invalid_plan" });
  assert.deepEqual(parseCheckoutRequest("pro", env), { ok: false, error: "invalid_plan" });
  // the client can never choose a price id directly
  assert.deepEqual(parseCheckoutRequest({ plan: "pro", interval: "month", priceId: "price_free_lunch" }, env), { ok: true, plan: "pro", interval: "month", priceId: "price_pro_month" });
});

test("checkout params: subscription mode, our price, user linkage, redirects, optional tax and terms", () => {
  const base = { priceId: "price_pro_month", plan: "pro" as const, interval: "month" as const, userId: "u1", email: "a@b.co", siteUrl: "https://app.example", env: {} };
  const p = buildCheckoutParams(base);
  assert.equal(p.mode, "subscription");
  assert.deepEqual(p.line_items, [{ price: "price_pro_month", quantity: 1 }]);
  assert.equal(p.client_reference_id, "u1");
  assert.equal((p as { customer_email?: string }).customer_email, "a@b.co");
  assert.equal(p.success_url, "https://app.example/pricing?checkout=success");
  assert.equal(p.cancel_url, "https://app.example/pricing?checkout=cancelled");
  assert.deepEqual(p.subscription_data.metadata, { user_id: "u1", plan: "pro", interval: "month" });
  assert.ok(!("automatic_tax" in p) && !("consent_collection" in p));
  const withCustomer = buildCheckoutParams({ ...base, customerId: "cus_9" }) as { customer?: string; customer_email?: string };
  assert.equal(withCustomer.customer, "cus_9");
  assert.equal(withCustomer.customer_email, undefined);
  const full = buildCheckoutParams({ ...base, env: { STRIPE_AUTOMATIC_TAX: "1", STRIPE_REQUIRE_TERMS: "1" } }) as Record<string, unknown>;
  assert.deepEqual(full.automatic_tax, { enabled: true });
  assert.deepEqual(full.consent_collection, { terms_of_service: "required" });
});

// ---- webhook handler with fakes ----
function fakeDeps(initial: Profile[] = [], subs: Record<string, SubscriptionLike> = {}) {
  const db = new Map(initial.map((p) => [p.user_id, p]));
  const deps: WebhookDeps = {
    env,
    retrieveSubscription: async (id) => subs[id],
    findProfile: async ({ userId, customerId }) => (userId ? db.get(userId) ?? null : [...db.values()].find((p) => p.stripe_customer_id === customerId) ?? null),
    saveProfile: async (userId, patch) => { db.set(userId, { user_id: userId, ...patch }); },
  };
  return { deps, db };
}
const ev = (type: string, object: Record<string, unknown>, created = 100): StripeEventLike => ({ id: "evt_" + created, type, created, data: { object } });
const profile = (o: Partial<Profile> = {}): Profile => ({ user_id: "user-1", plan: "starter", interval: null, status: "none", stripe_customer_id: "cus_1", stripe_subscription_id: null, current_period_end: null, cancel_at_period_end: false, last_event_at: 0, ...o });

test("webhook: subscription created grants the plan; deleted takes it away", async () => {
  const { deps, db } = fakeDeps();
  assert.deepEqual(await handleStripeEvent(ev("customer.subscription.created", sub() as unknown as Record<string, unknown>, 100), deps), { handled: true, userId: "user-1", plan: "pro" });
  assert.equal(db.get("user-1")!.plan, "pro");
  await handleStripeEvent(ev("customer.subscription.deleted", sub({ status: "canceled" }) as unknown as Record<string, unknown>, 200), deps);
  assert.equal(db.get("user-1")!.plan, "starter");
  assert.equal(db.get("user-1")!.status, "canceled");
});

test("webhook: checkout.session.completed fetches the subscription and grants the plan", async () => {
  const { deps, db } = fakeDeps([], { sub_9: sub({ id: "sub_9", metadata: null }) });
  const r = await handleStripeEvent(ev("checkout.session.completed", { mode: "subscription", subscription: "sub_9", client_reference_id: "user-7" }), deps);
  assert.deepEqual(r, { handled: true, userId: "user-7", plan: "pro" });
  assert.equal(db.get("user-7")!.stripe_subscription_id, "sub_9");
});

test("webhook: a later event is applied, an earlier one arriving late is not", async () => {
  const { deps, db } = fakeDeps([profile({ plan: "pro", last_event_at: 500 })]);
  const stale = await handleStripeEvent(ev("customer.subscription.updated", sub({ status: "canceled" }) as unknown as Record<string, unknown>, 400), deps);
  assert.deepEqual(stale, { handled: false, reason: "stale_event" });
  assert.equal(db.get("user-1")!.plan, "pro");
  const fresh = await handleStripeEvent(ev("customer.subscription.updated", sub({ status: "canceled" }) as unknown as Record<string, unknown>, 600), deps);
  assert.equal(fresh.handled, true);
  assert.equal(db.get("user-1")!.plan, "starter");
});

test("webhook: user is found through the Stripe customer when metadata is missing", async () => {
  const { deps, db } = fakeDeps([profile({ user_id: "user-5", stripe_customer_id: "cus_5" })]);
  const r = await handleStripeEvent(ev("customer.subscription.updated", sub({ customer: "cus_5", metadata: null }) as unknown as Record<string, unknown>), deps);
  assert.deepEqual(r, { handled: true, userId: "user-5", plan: "pro" });
  assert.equal(db.get("user-5")!.plan, "pro");
});

test("webhook: unknown price, unknown user and unrelated events change nothing", async () => {
  const { deps, db } = fakeDeps();
  assert.deepEqual(await handleStripeEvent(ev("customer.subscription.created", sub({ price: "price_x" }) as unknown as Record<string, unknown>), deps), { handled: false, reason: "unknown_price" });
  assert.deepEqual(await handleStripeEvent(ev("customer.subscription.created", sub({ metadata: null, customer: "cus_nobody" }) as unknown as Record<string, unknown>), deps), { handled: false, reason: "no_user" });
  assert.deepEqual(await handleStripeEvent(ev("invoice.paid", {}), deps), { handled: false, reason: "ignored_event" });
  assert.deepEqual(await handleStripeEvent(ev("checkout.session.completed", { mode: "payment" }), deps), { handled: false, reason: "ignored_event" });
  assert.equal(db.size, 0);
});

// ---- real webhook signature verification, offline, with Stripe's own library ----
test("webhook signatures: valid accepted; tampered body, wrong secret and stale timestamp rejected", () => {
  const stripe = new Stripe("sk_test_dummy");
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_1", object: "event", type: "customer.subscription.updated", created: 1, data: { object: {} } });
  const good = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(stripe.webhooks.constructEvent(payload, good, secret).id, "evt_1");
  assert.throws(() => stripe.webhooks.constructEvent(payload + " ", good, secret));
  assert.throws(() => stripe.webhooks.constructEvent(payload, good, "whsec_other"));
  const old = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  assert.throws(() => stripe.webhooks.constructEvent(payload, old, secret));
  assert.throws(() => stripe.webhooks.constructEvent(payload, "", secret));
});

// ---- the HTTP layer (checkout, portal, webhook) with everything external faked ----
import { processCheckout, processPortal, processWebhook } from "./http.ts";

const benv = { ...env, NEXT_PUBLIC_BILLING_ENABLED: "true" } as Record<string, string>;
const user = { id: "u1", email: "u1@example.com" };
const checkoutDeps = (o: Partial<Parameters<typeof processCheckout>[0]> = {}) => {
  const created: unknown[] = [];
  return {
    created,
    deps: {
      env: benv, siteUrl: "https://app.example", user, body: { plan: "pro", interval: "month" },
      loadProfile: async () => null,
      createSession: async (p: unknown) => { created.push(p); return { url: "https://checkout.stripe.com/c/abc" }; },
      ...o,
    } as Parameters<typeof processCheckout>[0],
  };
};

test("checkout: creates a session for a signed-in user; refuses everyone else", async () => {
  const ok = checkoutDeps();
  assert.deepEqual(await processCheckout(ok.deps), { status: 200, body: { url: "https://checkout.stripe.com/c/abc" } });
  assert.equal(ok.created.length, 1);
  assert.equal((await processCheckout(checkoutDeps({ user: null }).deps)).status, 401);
  assert.equal((await processCheckout(checkoutDeps({ env: { ...benv, NEXT_PUBLIC_BILLING_ENABLED: "false" } }).deps)).status, 503);
  assert.equal((await processCheckout(checkoutDeps({ body: { plan: "starter", interval: "month" } }).deps)).status, 400);
  assert.equal((await processCheckout(checkoutDeps({ body: { plan: "pro", interval: "day" } }).deps)).status, 400);
  assert.equal((await processCheckout(checkoutDeps({ env: { NEXT_PUBLIC_BILLING_ENABLED: "true" } }).deps)).status, 503, "unconfigured price");
});

test("checkout: someone with an active subscription cannot start a second one (no double billing)", async () => {
  for (const status of ["active", "trialing", "past_due"]) {
    const c = checkoutDeps({ loadProfile: async () => ({ stripe_customer_id: "cus_1", status, plan: "plus" as const }) });
    const r = await processCheckout(c.deps);
    assert.deepEqual(r, { status: 409, body: { error: "already_subscribed" } }, status);
    assert.equal(c.created.length, 0);
  }
  // a cancelled customer may re-subscribe, and reuses their Stripe customer record
  const again = checkoutDeps({ loadProfile: async () => ({ stripe_customer_id: "cus_1", status: "canceled", plan: "starter" as const }) });
  assert.equal((await processCheckout(again.deps)).status, 200);
  assert.equal((again.created[0] as { customer?: string }).customer, "cus_1");
});

test("checkout: Stripe returning no URL is reported, not hidden", async () => {
  assert.equal((await processCheckout(checkoutDeps({ createSession: async () => ({ url: null }) }).deps)).status, 502);
});

test("portal: needs sign-in and an existing Stripe customer", async () => {
  const base = { env: benv, siteUrl: "https://app.example", user, loadProfile: async () => ({ stripe_customer_id: "cus_1" }), createPortal: async (c: string, r: string) => ({ url: `https://billing.stripe.com/${c}?return=${encodeURIComponent(r)}` }) };
  const ok = await processPortal(base);
  assert.equal(ok.status, 200);
  assert.ok(String(ok.body.url).includes("cus_1") && String(ok.body.url).includes(encodeURIComponent("https://app.example/pricing")));
  assert.equal((await processPortal({ ...base, user: null })).status, 401);
  assert.equal((await processPortal({ ...base, loadProfile: async () => ({ stripe_customer_id: null }) })).status, 404);
  assert.equal((await processPortal({ ...base, loadProfile: async () => null })).status, 404);
  assert.equal((await processPortal({ ...base, env: {} })).status, 503);
});

test("webhook endpoint: verifies the real signature before doing anything", async () => {
  const stripe = new Stripe("sk_test_dummy");
  const secret = "whsec_http";
  const { deps, db } = fakeDeps();
  const full = { ...deps, secret, constructEvent: (b: string, s: string, sec: string) => stripe.webhooks.constructEvent(b, s, sec) as unknown as StripeEventLike };
  const payload = JSON.stringify({ id: "evt_77", object: "event", type: "customer.subscription.created", created: 100, data: { object: sub() } });
  const good = Stripe.webhooks.generateTestHeaderString({ payload, secret });

  const ok = await processWebhook(payload, good, full);
  assert.equal(ok.status, 200);
  assert.equal(db.get("user-1")!.plan, "pro");

  db.clear();
  assert.equal((await processWebhook(payload, null, full)).status, 400);
  assert.equal((await processWebhook(payload, "t=1,v1=deadbeef", full)).status, 400);
  assert.equal((await processWebhook(payload + "x", good, full)).status, 400);
  assert.equal((await processWebhook(payload, good, { ...full, secret: undefined })).status, 503);
  assert.equal(db.size, 0, "nothing was granted by any rejected request");
});

test("webhook endpoint: a storage failure returns 500 so Stripe retries", async () => {
  const stripe = new Stripe("sk_test_dummy");
  const secret = "whsec_http";
  const { deps } = fakeDeps();
  const broken = { ...deps, secret, saveProfile: async () => { throw new Error("db down"); }, constructEvent: (b: string, s: string, sec: string) => stripe.webhooks.constructEvent(b, s, sec) as unknown as StripeEventLike };
  const payload = JSON.stringify({ id: "evt_78", object: "event", type: "customer.subscription.created", created: 100, data: { object: sub() } });
  assert.equal((await processWebhook(payload, Stripe.webhooks.generateTestHeaderString({ payload, secret }), broken)).status, 500);
});
