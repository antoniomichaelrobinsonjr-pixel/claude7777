import { NextRequest, NextResponse } from "next/server";
import { adminClient, authedUser, profileStore } from "@/billing/server";
import { processMarketRead } from "@/market/http";
import { marketReader } from "@/market/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const admin = adminClient();
    const reader = marketReader(admin);
    const store = profileStore(admin);
    const r = await processMarketRead({
      billingEnabled: process.env.NEXT_PUBLIC_BILLING_ENABLED === "true",
      user: await authedUser(req, admin),
      country: req.nextUrl.searchParams.get("country"),
      loadPlan: async (id) => {
        const p = await store.findProfile({ userId: id });
        return p ? { plan: p.plan, status: p.status } : null;
      },
      load: reader.load,
      meta: reader.meta,
    });
    return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "market_unavailable" }, { status: 503 });
  }
}
