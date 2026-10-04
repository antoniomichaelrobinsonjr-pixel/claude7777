import "server-only";
import Stripe from "stripe";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import type { AuthedUser } from "./http";
import type { Profile, ProfilePatch } from "./stripe-map";

/** Server-side clients. Secrets live only in server environment variables, never in the browser bundle. */
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return new Stripe(key);
}

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export const siteUrl = (req: NextRequest) => (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, "");

/** Who is calling? The browser sends its Supabase access token; we check it with Supabase rather than trusting the client. */
export async function authedUser(req: NextRequest, admin: SupabaseClient): Promise<AuthedUser | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data.user ? null : { id: data.user.id, email: data.user.email };
}

export const profileStore = (admin: SupabaseClient) => ({
  async findProfile(by: { userId?: string; customerId?: string }): Promise<Profile | null> {
    const q = admin.from("profiles").select("*");
    const { data } = await (by.userId ? q.eq("user_id", by.userId) : q.eq("stripe_customer_id", by.customerId ?? "")).maybeSingle();
    return (data as Profile | null) ?? null;
  },
  async saveProfile(userId: string, patch: ProfilePatch): Promise<void> {
    const { error } = await admin.from("profiles").upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  },
});
