"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import type { Project } from "@/lib/comps";
import { ACCESS_STATUSES } from "./stripe-map";
import { PLANS, applyPlan, can as planCan, canAddComp, canCreateAnalysis, isPlanId, lockedCompCount, type Feature, type Interval, type PlanId } from "./plans";

/**
 * Billing is OFF unless NEXT_PUBLIC_BILLING_ENABLED=true. While it is off everyone gets everything with no limits,
 * which is how the app behaved before memberships existed.
 *
 * NEXT_PUBLIC_BILLING_PREVIEW=1 (with billing enabled) lets you pick a plan from the pricing page to see how the app
 * behaves on it. It is for staging and demos only: never set it in production, because it lets anyone choose a plan.
 */
export const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";
export const PREVIEW_ENABLED = BILLING_ENABLED && process.env.NEXT_PUBLIC_BILLING_PREVIEW === "1";
const PREVIEW_KEY = "comppilot.previewPlan";

export interface Subscription {
  interval: Interval | null;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface Entitlements {
  billingEnabled: boolean;
  preview: boolean;
  loading: boolean;
  signedIn: boolean;
  planId: PlanId;
  subscription: Subscription | null;
  previewPlan: PlanId | null;
  setPreviewPlan: (p: PlanId | null) => void;
  can: (f: Feature) => boolean;
  /** Maximum comps per analysis; Infinity when billing is off. */
  maxComps: number;
  canCreate: (existingAnalyses: number) => boolean;
  canAddComp: (compCount: number) => boolean;
  /** The analysis as the plan sees it: comps beyond the limit are held back, never deleted. */
  apply: (p: Project) => Project;
  lockedComps: (p: Project) => number;
  refresh: () => Promise<void>;
}

const OPEN: Entitlements = {
  billingEnabled: false, preview: false, loading: false, signedIn: false, planId: "studio", subscription: null, previewPlan: null,
  setPreviewPlan: () => {}, can: () => true, maxComps: Infinity, canCreate: () => true, canAddComp: () => true,
  apply: (p) => p, lockedComps: () => 0, refresh: async () => {},
};

const Ctx = createContext<Entitlements>(OPEN);
export const useEntitlements = () => useContext(Ctx);

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(BILLING_ENABLED);
  const [signedIn, setSignedIn] = useState(false);
  const [dbPlan, setDbPlan] = useState<PlanId>("starter");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [previewPlan, setPreviewState] = useState<PlanId | null>(null);

  const load = useCallback(async () => {
    if (!BILLING_ENABLED) return;
    if (!supabase) { setSignedIn(false); setDbPlan("starter"); setSubscription(null); setLoading(false); return; }
    const { data: { session } } = await supabase.auth.getSession();
    setSignedIn(!!session);
    if (!session) { setDbPlan("starter"); setSubscription(null); setLoading(false); return; }
    const { data } = await supabase.from("profiles")
      .select("plan, interval, status, current_period_end, cancel_at_period_end").eq("user_id", session.user.id).maybeSingle();
    const active = !!data && ACCESS_STATUSES.has(data.status) && isPlanId(data.plan);
    setDbPlan(active ? (data!.plan as PlanId) : "starter");
    setSubscription(data && data.status !== "none"
      ? { interval: data.interval ?? null, status: data.status, currentPeriodEnd: data.current_period_end ?? null, cancelAtPeriodEnd: !!data.cancel_at_period_end }
      : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!BILLING_ENABLED) return;
    try {
      const saved = localStorage.getItem(PREVIEW_KEY);
      if (PREVIEW_ENABLED && isPlanId(saved)) setPreviewState(saved);
    } catch { /* storage may be unavailable */ }
    load();
    const sub = supabase?.auth.onAuthStateChange(() => { load(); });
    return () => sub?.data.subscription.unsubscribe();
  }, [load]);

  const setPreviewPlan = useCallback((p: PlanId | null) => {
    if (!PREVIEW_ENABLED) return;
    setPreviewState(p);
    try { p ? localStorage.setItem(PREVIEW_KEY, p) : localStorage.removeItem(PREVIEW_KEY); } catch { /* ignore */ }
  }, []);

  const value = useMemo<Entitlements>(() => {
    if (!BILLING_ENABLED) return OPEN;
    const planId = PREVIEW_ENABLED && previewPlan ? previewPlan : dbPlan;
    return {
      billingEnabled: true, preview: PREVIEW_ENABLED, loading, signedIn, planId, subscription, previewPlan, setPreviewPlan,
      can: (f) => planCan(planId, f),
      maxComps: PLANS[planId].maxComps,
      canCreate: (n) => canCreateAnalysis(planId, n),
      canAddComp: (n) => canAddComp(planId, n),
      apply: (p) => applyPlan(p, planId),
      lockedComps: (p) => lockedCompCount(p, planId),
      refresh: load,
    };
  }, [dbPlan, loading, signedIn, subscription, previewPlan, setPreviewPlan, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
