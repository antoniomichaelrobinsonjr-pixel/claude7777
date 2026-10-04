import { NextRequest, NextResponse } from "next/server";
import { processPortal } from "@/billing/http";
import { adminClient, authedUser, profileStore, siteUrl, stripeClient } from "@/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    if (process.env.NEXT_PUBLIC_BILLING_ENABLED !== "true") return NextResponse.json({ error: "billing_disabled" }, { status: 503 });
    const admin = adminClient();
    const store = profileStore(admin);
    const stripe = stripeClient();
    const r = await processPortal({
      env: process.env,
      siteUrl: siteUrl(req),
      user: await authedUser(req, admin),
      loadProfile: (id) => store.findProfile({ userId: id }),
      createPortal: async (customer, return_url) => ({ url: (await stripe.billingPortal.sessions.create({ customer, return_url })).url }),
    });
    return NextResponse.json(r.body, { status: r.status });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
