import { isNewerOrEqual, patchFromSubscription, type Env, type Profile, type ProfilePatch, type SubscriptionLike } from "./stripe-map.ts";

export interface StripeEventLike {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

/** Everything the handler needs from the outside world, so it can be tested with fakes. */
export interface WebhookDeps {
  env: Env;
  retrieveSubscription(id: string): Promise<SubscriptionLike>;
  findProfile(by: { userId?: string; customerId?: string }): Promise<Profile | null>;
  saveProfile(userId: string, patch: ProfilePatch): Promise<void>;
}

export type WebhookResult =
  | { handled: true; userId: string; plan: string }
  | { handled: false; reason: "ignored_event" | "unknown_price" | "no_user" | "stale_event" };

const SUBSCRIPTION_EVENTS = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);

export async function handleStripeEvent(event: StripeEventLike, deps: WebhookDeps): Promise<WebhookResult> {
  let sub: SubscriptionLike;
  let userId: string | undefined;

  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    sub = event.data.object as unknown as SubscriptionLike;
    userId = sub.metadata?.user_id || undefined;
  } else if (event.type === "checkout.session.completed") {
    const s = event.data.object as { subscription?: string | null; client_reference_id?: string | null; mode?: string };
    if (s.mode !== "subscription" || !s.subscription) return { handled: false, reason: "ignored_event" };
    sub = await deps.retrieveSubscription(s.subscription);
    userId = s.client_reference_id || sub.metadata?.user_id || undefined;
  } else {
    return { handled: false, reason: "ignored_event" };
  }

  // The user id comes from our own metadata; fall back to the Stripe customer we already linked.
  let existing: Profile | null = null;
  if (userId) existing = await deps.findProfile({ userId });
  else existing = await deps.findProfile({ customerId: sub.customer });

  const patch = patchFromSubscription(sub, deps.env, event.created, existing?.trials_used ?? []);
  if (!patch) return { handled: false, reason: "unknown_price" };
  const resolved = userId ?? existing?.user_id;
  if (!resolved) return { handled: false, reason: "no_user" };

  if (!isNewerOrEqual(existing?.last_event_at, event.created)) return { handled: false, reason: "stale_event" };
  await deps.saveProfile(resolved, patch);
  return { handled: true, userId: resolved, plan: patch.plan };
}
