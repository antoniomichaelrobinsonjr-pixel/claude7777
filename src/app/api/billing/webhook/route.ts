import { NextRequest, NextResponse } from "next/server";
import { processWebhook } from "@/billing/http";
import { adminClient, profileStore, stripeClient } from "@/billing/server";
import type { StripeEventLike } from "@/billing/webhook";
import type { SubscriptionLike } from "@/billing/stripe-map";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const stripe = stripeClient();
    const store = profileStore(adminClient());
    // The signature is computed over the exact raw bytes, so read the body as text and never re-serialise it.
    const raw = await req.text();
    const r = await processWebhook(raw, req.headers.get("stripe-signature"), {
      env: process.env,
      secret: process.env.STRIPE_WEBHOOK_SECRET,
      constructEvent: (body, sig, secret) => stripe.webhooks.constructEvent(body, sig, secret) as unknown as StripeEventLike,
      retrieveSubscription: async (id) => (await stripe.subscriptions.retrieve(id)) as unknown as SubscriptionLike,
      ...store,
    });
    return NextResponse.json(r.body, { status: r.status });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
