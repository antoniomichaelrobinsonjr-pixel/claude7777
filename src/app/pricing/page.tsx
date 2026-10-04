"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { n } from "@/i18n/format";
import { supabase } from "@/lib/supabase";
import { useEntitlements } from "@/billing/entitlements";
import { FEATURES, INTERVALS, PLANS, PLAN_IDS, can, monthlyEquivalentCents, trialEligible, yearlySavingsPct, type Interval, type PlanId } from "@/billing/plans";

const RECOMMENDED: PlanId = "pro";

export default function PricingPage() {
  const { t, usd, num, date } = useI18n();
  const ent = useEntitlements();
  const [interval, setInterval] = useState<Interval>("month");
  const [busy, setBusy] = useState<PlanId | "portal" | null>(null);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState<"success" | "cancelled" | "">("");

  useEffect(() => {
    const c = new URLSearchParams(location.search).get("checkout");
    if (c === "success") {
      setBanner("success");
      // The webhook updates the plan a moment after Stripe redirects back, so look a few times.
      let tries = 0;
      const id = window.setInterval(() => { ent.refresh(); if (++tries >= 8) window.clearInterval(id); }, 2500);
      return () => window.clearInterval(id);
    }
    if (c === "cancelled") setBanner("cancelled");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function call(path: "checkout" | "portal", body?: object) {
    setError("");
    const { data: { session } } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
    if (!session) { setError(t("pricing.err.sign_in_required")); return; }
    try {
      const res = await fetch(`/api/billing/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body ?? {}),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.url) { window.location.href = json.url; return; }
      const key = `pricing.err.${json.error}`;
      setError(["sign_in_required", "already_subscribed", "not_configured", "billing_disabled"].includes(json.error) ? t(key) : t("pricing.err.generic"));
    } catch {
      setError(t("pricing.err.generic"));
    }
  }

  async function choose(plan: PlanId) {
    setBusy(plan);
    await call("checkout", { plan, interval });
    setBusy(null);
  }

  const price = (plan: PlanId) => {
    const cents = PLANS[plan].prices[interval];
    return cents === null ? null : usd(cents / 100);
  };
  const subscribed = ent.subscription && ent.planId !== "starter";
  const dateOf = (iso: string | null) => (iso ? date(new Date(iso)) : "");

  return (
    <div className="space-y-8">
      <header className="mx-auto max-w-2xl text-center">
        <h1 className="display text-4xl font-bold md:text-5xl">{t("pricing.title")}</h1>
        <p className="muted mt-3 text-lg">{t("pricing.subtitle")}</p>
      </header>

      {ent.preview && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm" style={{ borderColor: "var(--warn)" }} role="note">
          <span>{t("pricing.previewBanner")}</span>
          <label className="flex items-center gap-2 font-semibold">
            {t("pricing.previewLabel")}
            <select className="input !mt-0 !w-auto" value={ent.previewPlan ?? ""} onChange={(e) => ent.setPreviewPlan((e.target.value || null) as PlanId | null)}>
              <option value="">{t("pricing.previewOff")}</option>
              {PLAN_IDS.map((p) => <option key={p} value={p}>{t(`plan.${p}.name`)}</option>)}
            </select>
          </label>
        </div>
      )}

      {banner === "success" && <p className="card p-4 text-center text-sm" role="status" style={{ color: "var(--ok)" }}>{t("pricing.success")}</p>}
      {banner === "cancelled" && <p className="card muted p-4 text-center text-sm" role="status">{t("pricing.cancelled")}</p>}
      {error && <p className="card p-4 text-center text-sm" role="alert" style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="flex justify-center">
        <div role="radiogroup" aria-label={t("pricing.intervalLabel")} className="card inline-flex max-w-full flex-wrap gap-1 p-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv} role="radio" aria-checked={interval === iv} onClick={() => setInterval(iv)}
              className="rounded-xl px-3 py-2 sm:px-4 text-sm font-semibold transition"
              style={interval === iv ? { background: "var(--brand)", color: "var(--brand-ink)" } : { color: "var(--muted)" }}
            >
              {t(`billing.interval.${iv}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_IDS.map((id) => {
          const plan = PLANS[id];
          const current = ent.billingEnabled && ent.planId === id;
          const highlight = id === RECOMMENDED;
          const savings = yearlySavingsPct(id);
          return (
            <section
              key={id} id={`plan-${id}`}
              className="card flex min-w-0 break-words scroll-mt-24 flex-col gap-4 p-6"
              style={highlight ? { borderColor: "var(--gold-b)", boxShadow: "0 0 0 1px var(--gold-b), var(--shadow)" } : undefined}
              aria-labelledby={`plan-${id}-name`}
            >
              <div className="min-h-[1.5rem]">
                {highlight && <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "var(--surface-2)", color: "var(--accent)" }}>{t("pricing.recommended")}</span>}
              </div>
              <div>
                <h2 id={`plan-${id}-name`} className="display text-2xl font-bold">{t(`plan.${id}.name`)}</h2>
                <p className="muted mt-1 text-sm">{t(`plan.${id}.tag`)}</p>
              </div>
              <div>
                {price(id) === null ? (
                  <p className="display text-4xl font-bold">{t("billing.free")}</p>
                ) : (
                  <>
                    <p className="display text-4xl font-bold">{t(`billing.price.${interval}`, { price: price(id)! })}</p>
                    <p className="muted mt-1 min-h-[1.25rem] text-sm">
                      {interval === "year" && savings !== null && <>{t("billing.save", { pct: num(n.pct0(savings)) })} · {t("billing.yearEquivalent", { price: usd(monthlyEquivalentCents(id, "year")! / 100) })}</>}
                      {interval === "week" && t("billing.weekHint")}
                    </p>
                  </>
                )}
              </div>
              <ul className="space-y-2 text-sm">
                <li>✓ {plan.maxAnalyses === null ? t("plan.limit.unlimited") : t("plan.limit.analyses", { count: plan.maxAnalyses })}</li>
                <li>✓ {t("plan.limit.comps", { count: plan.maxComps })}</li>
                {plan.rank > 0 && <li className="muted pt-1 font-semibold">{t("pricing.everythingIn", { plan: t(`plan.${PLAN_IDS[plan.rank - 1]}.name`) })}</li>}
                {plan.features.filter((f) => !PLANS[PLAN_IDS[plan.rank - 1] ?? "starter"].features.includes(f)).map((f) => <li key={f}>✓ {t(`feature.${f}`)}</li>)}
              </ul>
              <div className="mt-auto space-y-3">
                {ent.billingEnabled && !current && !subscribed && id !== "starter" && price(id) !== null && (!ent.signedIn || trialEligible(id, ent.trialsUsed)) && (
                  <p className="muted text-xs">{t("pricing.trialTerms", { price: t(`billing.price.${interval}`, { price: price(id)! }) })}</p>
                )}
                {current ? (
                  <button className="btn w-full justify-center" disabled>{t("pricing.cta.current")}</button>
                ) : id === "starter" ? (
                  <Link href="/" className="btn w-full justify-center">{t("pricing.cta.startFree")}</Link>
                ) : !ent.billingEnabled ? (
                  <button className="btn w-full justify-center" disabled>{t("pricing.cta.unavailable")}</button>
                ) : !ent.signedIn ? (
                  <Link href="/login?next=/pricing" className="btn btn-primary w-full justify-center">{t("pricing.cta.signIn")}</Link>
                ) : subscribed ? (
                  <button className="btn w-full justify-center" disabled={busy !== null} onClick={async () => { setBusy("portal"); await call("portal"); setBusy(null); }}>{t("pricing.cta.manage")}</button>
                ) : (
                  <button className="btn btn-primary w-full justify-center" disabled={busy !== null} onClick={() => choose(id)}>
                    {busy === id ? t("pricing.cta.working") : trialEligible(id, ent.trialsUsed) ? t("pricing.cta.trial") : t("pricing.cta.choose", { plan: t(`plan.${id}.name`) })}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {ent.billingEnabled && ent.subscription && (
        <div className="card p-5 text-sm">
          <p className="font-semibold">{t("billing.yourPlan", { plan: t(`plan.${ent.planId}.name`) })}</p>
          <p className="muted mt-1">
            {ent.subscription.status === "past_due" ? t("pricing.status.pastDue")
              : ent.subscription.cancelAtPeriodEnd ? t("pricing.status.ends", { date: dateOf(ent.subscription.currentPeriodEnd) })
              : ent.subscription.status === "trialing" ? t("pricing.status.trialing", { date: dateOf(ent.subscription.currentPeriodEnd) })
              : ent.subscription.currentPeriodEnd ? t("pricing.status.renews", { date: dateOf(ent.subscription.currentPeriodEnd) }) : ""}
          </p>
          <button className="btn mt-3" disabled={busy !== null} onClick={async () => { setBusy("portal"); await call("portal"); setBusy(null); }}>{t("pricing.cta.manage")}</button>
        </div>
      )}

      <section className="card p-6" aria-labelledby="compare-title">
        <h2 id="compare-title" className="display mb-4 text-2xl font-semibold">{t("pricing.compare")}</h2>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("pricing.compareTable")}>
          <table className="w-full min-w-[640px] text-start text-sm">
            <thead>
              <tr className="muted text-xs uppercase">
                <th className="py-2 pe-3 text-start">{t("pricing.compare.feature")}</th>
                {PLAN_IDS.map((p) => <th key={p} className="px-2 text-center">{t(`plan.${p}.name`)}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 pe-3">{t("pricing.row.analyses")}</td>
                {PLAN_IDS.map((p) => <td key={p} className="px-2 text-center">{PLANS[p].maxAnalyses === null ? t("billing.unlimited") : num(n.int(PLANS[p].maxAnalyses!))}</td>)}
              </tr>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 pe-3">{t("pricing.row.comps")}</td>
                {PLAN_IDS.map((p) => <td key={p} className="px-2 text-center">{num(n.int(PLANS[p].maxComps))}</td>)}
              </tr>
              {FEATURES.map((f) => (
                <tr key={f} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2 pe-3">{t(`feature.${f}`)}</td>
                  {PLAN_IDS.map((p) => (
                    <td key={p} className="px-2 text-center">
                      {can(p, f) ? <span style={{ color: "var(--ok)" }} aria-label={t("pricing.included")}>✓</span> : <span className="muted" aria-label={t("pricing.notIncluded")}>—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ul className="muted mx-auto max-w-3xl list-disc space-y-2 ps-5 text-sm">
        <li>{t("pricing.renew")}</li>
        <li>{t("pricing.downgrade")}</li>
        <li>{t("pricing.notAppraisal")}</li>
        <li>{t("pricing.currency")}</li>
      </ul>
    </div>
  );
}
