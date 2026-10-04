"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { n } from "@/i18n/format";
import { supabase } from "@/lib/supabase";
import { useEntitlements } from "@/billing/entitlements";
import { UpgradeNotice } from "@/billing/ui";
import { countryName, countryOptions } from "./countries";
import { driftSince, latestPoint, yearOnYear, type IndexPoint } from "./series";

export type MarketState =
  | { kind: "loading" }
  | { kind: "ready"; series: IndexPoint[]; updatedAt: string; source: string }
  | { kind: "none" }
  | { kind: "error" }
  | { kind: "locked" };

/** Fetch a country's index from our own API (which checks the plan), sending the sign-in token when there is one. */
export function useMarket(country: string | undefined, enabled: boolean): MarketState | null {
  const [state, setState] = useState<MarketState | null>(null);
  useEffect(() => {
    if (!country || !enabled) { setState(null); return; }
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const token = (await supabase?.auth.getSession())?.data.session?.access_token;
        const res = await fetch(`/api/market?country=${encodeURIComponent(country)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (cancelled) return;
        if (res.status === 403 || res.status === 401) return setState({ kind: "locked" });
        if (!res.ok) return setState({ kind: "error" });
        const body = await res.json();
        setState(body.available ? { kind: "ready", series: body.series, updatedAt: body.updatedAt, source: body.source } : { kind: "none" });
      } catch {
        if (!cancelled) setState({ kind: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [country, enabled]);
  return state;
}

export interface MarketComp { id: string; address: string; saleDate: string }

const signed = (v: number, fmt: (x: number) => string) => `${v < 0 ? "−" : "+"}${fmt(Math.abs(v))}`;

function Sparkline({ series, label }: { series: IndexPoint[]; label: string }) {
  const pts = series.slice(-24);
  if (pts.length < 2) return null;
  const vals = pts.map((p) => p.value), lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const W = 240, H = 64;
  const xy = pts.map((p, i) => `${(i / (pts.length - 1)) * W},${H - 6 - ((p.value - lo) / span) * (H - 12)}`);
  return (
    <div className="max-w-md">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-16 w-full rtl:-scale-x-100" preserveAspectRatio="none">
        <polygon points={`0,${H} ${xy.join(" ")} ${W},${H}`} fill="var(--accent)" opacity="0.12" />
        <polyline points={xy.join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="muted flex justify-between text-xs" dir="ltr" aria-hidden><span>{pts[0].period}</span><span>{pts[pts.length - 1].period}</span></div>
    </div>
  );
}

/**
 * Daily-refreshed market context for the property's country, and how far the market has moved since each comp sold.
 * It is context only: it never changes the analysis value.
 */
export function MarketPanel({ country, comps, showChoose = true, className = "", onChooseCountry }: { country: string | undefined; comps: MarketComp[]; showChoose?: boolean; className?: string; onChooseCountry?: (country: string | undefined) => void }) {
  const { t, num, date, info } = useI18n();
  const ent = useEntitlements();
  const allowed = ent.can("marketUpdates");
  const state = useMarket(country, allowed);
  const name = country ? countryName(country, info.intl) : "";

  if (!allowed) return <div className={className}><UpgradeNotice feature="marketUpdates" /></div>;
  if (!country)
    return showChoose ? (
      <section className={`card space-y-3 p-5 ${className}`}>
        <h2 className="font-semibold">{t("market.title")}</h2>
        <p className="muted text-sm">{t("market.chooseCountry")}</p>
        {onChooseCountry && (
          <label className="field max-w-xs">{t("field.country")}
            <select className="input" value="" onChange={(e) => onChooseCountry(e.target.value || undefined)}>
              <option value="">{t("field.countryNone")}</option>
              {countryOptions(info.intl).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
        )}
      </section>
    ) : null;

  let body: React.ReactNode;
  if (!state || state.kind === "loading") body = <p className="muted text-sm" role="status">{t("market.loading")}</p>;
  else if (state.kind === "locked") body = <UpgradeNotice feature="marketUpdates" compact />;
  else if (state.kind === "error") body = <p className="text-sm" role="status" style={{ color: "var(--warn)" }}>{t("market.unavailable")}</p>;
  else if (state.kind === "none") body = <p className="muted text-sm">{t("market.noData", { country: name })}</p>;
  else {
    const last = latestPoint(state.series)!;
    const yoy = yearOnYear(state.series);
    const cutoff = Date.now() - 365 * 864e5;
    const old = comps.filter((c) => { const t0 = Date.parse(c.saleDate); return Number.isFinite(t0) && t0 < cutoff; }).length;
    const first = state.series[Math.max(0, state.series.length - 24)];
    body = (
      <>
        <p className="text-sm">
          {yoy === null
            ? t("market.noYoy", { country: name, period: last.period })
            : t("market.yoy", { country: name, change: signed(yoy, (v) => num(n.pct1(v))), period: last.period })}
        </p>
        <Sparkline series={state.series} label={t("market.chartLabel", { country: name, from: first.period, to: last.period })} />
        {comps.length > 0 && (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("market.driftTitle")}>
            <table className="w-full text-start text-sm">
              <caption className="muted pb-1 text-start text-xs font-semibold">{t("market.driftTitle")}</caption>
              <thead><tr className="muted text-xs"><th className="pe-3 text-start font-medium">{t("market.col.comp")}</th><th className="pe-3 text-start font-medium">{t("market.col.sold")}</th><th className="text-end font-medium">{t("market.col.drift")}</th></tr></thead>
              <tbody>
                {comps.map((c) => {
                  const dr = driftSince(state.series, c.saleDate);
                  const when = c.saleDate ? date(new Date(c.saleDate + "T00:00:00"), { year: "numeric", month: "short", day: "numeric" }) : "—";
                  return (
                    <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-1.5 pe-3 [overflow-wrap:anywhere]"><bdi>{c.address || t("common.unnamedComp")}</bdi></td>
                      <td className="whitespace-nowrap pe-3">{when}</td>
                      <td className="whitespace-nowrap text-end" dir="ltr">{dr === null ? t("market.na") : signed(dr, (v) => num(n.pct1(v)))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {old > 0 && <p className="text-sm" style={{ color: "var(--warn)" }}>{t("market.old", { count: old })}</p>}
        <p className="muted text-xs">{t("market.updated", { date: date(new Date(state.updatedAt)) })} {t("market.source", { source: state.source })}</p>
        <p className="muted text-xs">{t("market.disclaimer")}</p>
      </>
    );
  }
  return (
    <section className={`card space-y-3 p-5 ${className}`} aria-labelledby="market-title">
      <h2 id="market-title" className="font-semibold">{t("market.title")} · {name}</h2>
      {body}
    </section>
  );
}
