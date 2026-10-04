import { NextRequest, NextResponse } from "next/server";
import { processCheckout } from "@/billing/http";
import { adminClient, authedUser, profileStore, siteUrl, stripeClient } from "@/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (process.env.NEXT_PUBLIC_BILLING_ENABLED !== "true") return NextResponse.json({ error: "billing_disabled" }, { status: 503 });
    const admin = adminClient();
    const store = profileStore(admin);
    const stripe = stripeClient();
    const body = await req.json().catch(() => null);
    const r = await processCheckout({
      env: process.env,
      siteUrl: siteUrl(req),
      user: await authedUser(req, admin),
      body,
      loadProfile: (id) => store.findProfile({ userId: id }),
      createSession: async (params) => ({ url: (await stripe.checkout.sessions.create(params)).url }),
    });
    return NextResponse.json(r.body, { status: r.status });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
