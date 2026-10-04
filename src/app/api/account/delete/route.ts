import { NextRequest, NextResponse } from "next/server";
import { processDeleteAccount } from "@/account/http";
import { adminClient, authedUser, profileStore, stripeClient } from "@/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const admin = adminClient();
    const store = profileStore(admin);
    const r = await processDeleteAccount({
      user: await authedUser(req, admin),
      loadProfile: (id) => store.findProfile({ userId: id }),
      cancelSubscription: async (id) => {
        try { await stripeClient().subscriptions.cancel(id); return "cancelled"; }
        catch (e) { if ((e as { code?: string }).code === "resource_missing") return "already_gone"; throw e; }
      },
      deleteUser: async (id) => { const { error } = await admin.auth.admin.deleteUser(id); if (error) throw error; },
    });
    return NextResponse.json(r.body, { status: r.status });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
