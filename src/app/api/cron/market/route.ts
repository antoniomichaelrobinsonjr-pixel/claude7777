import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/billing/server";
import { processMarketRefresh } from "@/market/http";
import { bisUrl, fetchText, marketStore } from "@/market/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called once a day by a scheduler with `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends this itself). */
export async function GET(req: NextRequest) {
  try {
    const r = await processMarketRefresh(req.headers.get("authorization"), process.env.CRON_SECRET, {
      fetchText, url: bisUrl(), store: marketStore(adminClient()),
    });
    return NextResponse.json(r.body, { status: r.status });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
