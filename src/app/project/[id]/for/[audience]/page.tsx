"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject, saveProject } from "@/lib/storage";
import { analyze, isEstate, isLand, isUnit, type Project } from "@/lib/comps";
import { buildReport } from "@/lib/report";
import { buyerView, closestComps, DEFAULT_GROWTH, marketPath, ownerSummary, projection, sellerView, trailingCagr, type Position } from "@/lib/audience";
import { useI18n } from "@/i18n";
import { n } from "@/i18n/format";
import { useEntitlements } from "@/billing/entitlements";
import { GatedButton, UpgradeNotice } from "@/billing/ui";
import { BRAND_KEY, parseBrand, type Brand } from "@/billing/brand";
import type { Feature } from "@/billing/plans";
import { MarketPanel, useMarket } from "@/market/panel";
import { countryName } from "@/market/countries";
import { ReportTabs } from "../../report-tabs";
import { ValueChart } from "./value-chart";

type Audience = "seller" | "buyer" | "owner";
const AUDIENCES: Audience[] = ["seller", "buyer", "owner"];
const FEATURE: Record<Audience, Feature> = { seller: "sellerReport", buyer: "buyerReport", owner: "ownerReport" };
const POSITIONS: Position[] = ["belowRange", "lowerHalf", "upperHalf", "aboveRange"];

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card break-inside-avoid space-y-3 p-6 ${className}`}>
      <h2 className="display text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** A plain number box that shows nothing for zero (unless zero is a real answer) and saves when you leave it. */
function NumField({ label, value, onChange, onBlur, step = 1, zeroOk = false, max }: { label: string; value: number | undefined; onChange: (v: number) => void; onBlur: () => void; step?: number; zeroOk?: boolean; max?: number }) {
  return (
    <label className="field">{label}
      <input
        className="input" type="number" inputMode="decimal" step={step} min={zeroOk ? undefined : 0} max={max}
        value={value !== undefined && Number.isFinite(value) && (value !== 0 || zeroOk) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        onBlur={onBlur}
      />
    </label>
  );
}

export default function AudienceReportPage() {
  const { id, audience: raw } = useParams<{ id: string; audience: string }>();
  const audience = AUDIENCES.find((a) => a === raw) ?? null;
  const { t, tm, usd, num, date, info } = useI18n();
  const ent = useEntitlements();
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);
  const [brand, setBrand] = useState<Brand>({ name: "", logo: null });
  const [years, setYears] = useState(10);
  const asOf = useMemo(() => new Date(), []);

  useEffect(() => { getProject(id).then((p) => { setProject(p); setMissing(!p); }).catch(() => setMissing(true)); }, [id]);
  useEffect(() => { try { setBrand(parseBrand(localStorage.getItem(BRAND_KEY))); } catch { /* storage may be unavailable */ } }, []);

  const effective = useMemo(() => (project ? ent.apply(project) : null), [project, ent]);
  const analysis = useMemo(() => (effective ? analyze(effective) : null), [effective]);
  const report = useMemo(() => (effective ? buildReport(effective, asOf) : null), [effective, asOf]);
  const country = project?.subject.country;
  const market = useMarket(country, audience === "owner" && ent.can("marketUpdates"));

  if (!audience || missing)
    return (
      <div className="card space-y-3 p-8 text-center">
        <h1 className="text-xl font-semibold">{t("missing.title")}</h1>
        <Link href="/" className="btn btn-primary">{t("missing.back")}</Link>
      </div>
    );
  if (!project || !effective || !analysis || !report || ent.loading) return <p className="muted">{t("common.loading")}</p>;

  const feature = FEATURE[audience];
  const land = isLand(project.subject);
  const signedPct = (v: number) => `${v < 0 ? "−" : "+"}${num(n.pct1(Math.abs(v)))}`;
  const whiteLabel = ent.can("whiteLabel") && (brand.name.trim() !== "" || brand.logo !== null);
  const product = whiteLabel && brand.name.trim() ? brand.name.trim() : "CompPilot";
  const update = (patch: Partial<Project>) => setProject({ ...project, ...patch });
  const persist = () => { saveProject(project).catch(() => {}); };
  const dateStr = date(asOf);
  const byline = [
    ent.can("brandedReport") && project.preparedFor && t("report.byline.for", { name: project.preparedFor }),
    ent.can("brandedReport") && project.preparedBy && t("report.byline.by", { name: project.preparedBy }),
    dateStr,
  ].filter(Boolean).join(" · ");
  const when = (d: string) => (d ? date(new Date(`${d}T00:00:00`), { year: "numeric", month: "short", day: "numeric" }) : "—");
  const noComps = analysis.count === 0;

  const summary = (
    <Section title={t("audience.valueTitle")}>
      {noComps ? <p className="muted text-sm">{t("result.needOne")}</p> : (
        <>
          <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
            <div>
              <div className="muted text-xs font-semibold uppercase tracking-wider">{t("result.weighted")}</div>
              <div className="display gold-text text-4xl font-bold" dir="ltr">{usd(analysis.weighted)}</div>
            </div>
            <dl className="grid grid-cols-3 gap-x-6 text-sm">
              {([["result.low", analysis.low], ["result.median", analysis.median], ["result.high", analysis.high]] as const).map(([l, v]) => (
                <div key={l}><dt className="muted text-xs font-semibold uppercase">{t(l)}</dt><dd className="font-bold" dir="ltr">{usd(v)}</dd></div>
              ))}
            </dl>
          </div>
          <p className="muted text-sm">{t("result.compsUsed", { used: analysis.count, count: project.comps.length })}</p>
        </>
      )}
    </Section>
  );

  const position = (kind: "seller" | "buyer", pos: Position, price: number, pct: number | null) => (
    <>
      <p className="text-sm font-semibold">{t(`${kind}.pos.${pos}`)}</p>
      {pct !== null && <p className="text-sm">{t("audience.vsValue", { price: usd(price), pct: signedPct(pct), value: usd(analysis.weighted) })}</p>}
    </>
  );

  const compTable = (withFlags: boolean) => (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("audience.compsAria")}>
      <table className="w-full min-w-[480px] text-start text-sm">
        <thead className="muted text-xs uppercase"><tr><th className="py-1 pe-3 text-start">{t("col.property")}</th><th className="pe-3 text-start">{t("col.sold")}</th><th className="pe-3 text-end">{t("comp.salePrice")}</th><th className="text-end">{t("comp.adjustedPrice")}</th></tr></thead>
        <tbody>
          {(withFlags ? analysis.rows : closestComps(analysis)).map((r) => {
            const flags = withFlags ? report.comps.find((c) => c.id === r.comp.id)?.flags ?? [] : [];
            return (
              <tr key={r.comp.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                <td className="py-2 pe-3 [overflow-wrap:anywhere]">
                  <bdi className="font-semibold">{r.comp.address || t("common.unnamedComp")}</bdi>
                  {withFlags && (flags.length === 0
                    ? <div className="muted text-xs">{t("buyer.flags.none")}</div>
                    : <ul className="mt-1 list-disc ps-4 text-xs" style={{ color: "var(--warn)" }}>{flags.map((f, i) => <li key={i}>{tm(f)}</li>)}</ul>)}
                </td>
                <td className="whitespace-nowrap pe-3">{when(r.comp.saleDate)}</td>
                <td className="whitespace-nowrap pe-3 text-end" dir="ltr">{usd(r.comp.salePrice)}</td>
                <td className="whitespace-nowrap text-end font-semibold" dir="ltr">{usd(r.adjustedPrice)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  let body: React.ReactNode = null;

  if (audience === "seller") {
    const v = sellerView(effective, analysis);
    const c = project.sellerCosts ?? { agentPct: 0, otherPct: 0, payoff: 0 };
    body = (
      <>
        <section className="no-print card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("audience.inputs")}>
          <NumField label={t("seller.listLabel")} value={project.askingPrice} onChange={(x) => update({ askingPrice: x })} onBlur={persist} />
          <NumField label={t("seller.agentPct")} value={c.agentPct} step={0.1} max={100} onChange={(x) => update({ sellerCosts: { ...c, agentPct: x } })} onBlur={persist} />
          <NumField label={t("seller.otherPct")} value={c.otherPct} step={0.1} max={100} onChange={(x) => update({ sellerCosts: { ...c, otherPct: x } })} onBlur={persist} />
          <NumField label={t("seller.payoff")} value={c.payoff} onChange={(x) => update({ sellerCosts: { ...c, payoff: x } })} onBlur={persist} />
        </section>
        {summary}
        {v && (
          <>
            <Section title={t("seller.listCheck.title")}>
              {v.list === null ? <p className="muted text-sm">{t("seller.enterList")}</p> : position("seller", v.position!, v.list, v.vsWeightedPct)}
            </Section>
            <Section title={t("seller.net.title")}>
              <p className="muted text-sm">{v.hasCosts ? t("seller.net.intro") : t("seller.net.noCosts")}</p>
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("seller.net.title")}>
                <table className="w-full min-w-[360px] text-start text-sm">
                  <thead className="muted text-xs uppercase"><tr><th className="py-1 pe-3 text-start">{t("seller.net.at")}</th><th className="pe-3 text-end">{t("seller.net.price")}</th><th className="text-end">{t("seller.net.takeHome")}</th></tr></thead>
                  <tbody>
                    {([["seller.net.low", analysis.low, v.net.low], ["seller.net.indicated", analysis.weighted, v.net.weighted], ["seller.net.high", analysis.high, v.net.high], ...(v.list !== null ? [["seller.net.list", v.list, v.net.list!] as const] : [])] as const).map(([l, price, net]) => (
                      <tr key={l} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-2 pe-3">{t(l)}</td>
                        <td className="whitespace-nowrap pe-3 text-end" dir="ltr">{usd(price)}</td>
                        <td className="whitespace-nowrap text-end font-semibold" dir="ltr">{net < 0 ? "−" : ""}{usd(Math.abs(net))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
            <Section title={t("seller.comps.title")}>
              <p className="muted text-sm">{t("seller.comps.note")}</p>
              {compTable(false)}
            </Section>
          </>
        )}
        <MarketPanel country={country} showChoose={false} comps={analysis.rows.map((r) => ({ id: r.comp.id, address: r.comp.address, saleDate: r.comp.saleDate }))} />
      </>
    );
  } else if (audience === "buyer") {
    const v = buyerView(effective, analysis);
    body = (
      <>
        <section className="no-print card grid gap-3 p-4 sm:max-w-xs" aria-label={t("audience.inputs")}>
          <NumField label={t("buyer.askingLabel")} value={project.askingPrice} onChange={(x) => update({ askingPrice: x })} onBlur={persist} />
        </section>
        {summary}
        {!noComps && (
          <>
            <Section title={t("buyer.check.title")}>
              {!v ? <p className="muted text-sm">{t("buyer.enterAsking")}</p> : (
                <>
                  {position("buyer", v.position, v.asking, v.vsWeightedPct)}
                  <p className="text-sm">{v.roomToNegotiate > 0 ? t("buyer.room", { amount: usd(v.roomToNegotiate) }) : t("buyer.noRoom")}</p>
                  {v.askingPerUnit !== null && v.compsPerUnit !== null && v.perUnitVsCompsPct !== null && (
                    <p className="text-sm">{t(land ? "buyer.perUnit.land" : "buyer.perUnit.home", { asking: usd(v.askingPerUnit), comps: usd(v.compsPerUnit), pct: signedPct(v.perUnitVsCompsPct) })}</p>
                  )}
                </>
              )}
            </Section>
            <Section title={t("buyer.comps.title")}>{compTable(true)}</Section>
          </>
        )}
        <Section title={t("buyer.what.title")}>
          <ul className="list-disc space-y-1.5 ps-5 text-sm">
            {[1, 2, 3, 4, 5].map((i) => <li key={i}>{t(`${land ? "land." : isUnit(project.subject) ? "unit." : isEstate(project.subject) ? "estate." : ""}buyer.what.${i}`)}</li>)}
          </ul>
        </Section>
        <MarketPanel country={country} showChoose={false} comps={analysis.rows.map((r) => ({ id: r.comp.id, address: r.comp.address, saleDate: r.comp.saleDate }))} />
      </>
    );
  } else {
    const o = project.ownership ?? { purchasePrice: 0, purchaseDate: "", improvements: 0 };
    const g = project.growth ?? DEFAULT_GROWTH;
    const today = analysis.weighted;
    const s = noComps ? null : ownerSummary(project.ownership, today, asOf);
    const series = market?.kind === "ready" ? market.series : null;
    const path = s && series ? marketPath(series, today, project.ownership, asOf) : null;
    const trend = series ? trailingCagr(series, 5) : null;
    const rows = projection(today, g, years);
    const localName = country ? countryName(country, info.intl) : "";
    body = (
      <>
        <section className="no-print card grid gap-3 p-4 sm:grid-cols-3" aria-label={t("audience.inputs")}>
          <NumField label={t("owner.price")} value={o.purchasePrice} onChange={(x) => update({ ownership: { ...o, purchasePrice: x } })} onBlur={persist} />
          <label className="field">{t("owner.date")}
            <input className="input" type="date" value={o.purchaseDate} max={asOf.toISOString().slice(0, 10)} onChange={(e) => update({ ownership: { ...o, purchaseDate: e.target.value } })} onBlur={persist} />
          </label>
          <NumField label={t("owner.improvements")} value={o.improvements} onChange={(x) => update({ ownership: { ...o, improvements: x } })} onBlur={persist} />
          <fieldset className="sm:col-span-3">
            <legend className="field mb-1">{t("owner.rates")}</legend>
            <div className="grid gap-3 sm:grid-cols-4">
              {([["owner.scn.low", 0], ["owner.scn.mid", 1], ["owner.scn.high", 2]] as const).map(([l, i]) => (
                <NumField key={i} label={t(l)} value={g[i]} zeroOk step={0.5} max={50} onChange={(x) => { const next: [number, number, number] = [...g]; next[i] = x; update({ growth: next }); }} onBlur={persist} />
              ))}
              <label className="field">{t("owner.years")}
                <select className="input" value={years} onChange={(e) => setYears(Number(e.target.value))}>
                  {[5, 10, 20].map((y) => <option key={y} value={y}>{num(n.int(y))}</option>)}
                </select>
              </label>
            </div>
            {trend !== null && <p className="muted mt-2 text-xs">{t("owner.trend", { country: localName, pct: signedPct(trend) })}</p>}
          </fieldset>
        </section>
        {summary}
        {noComps ? null : !s ? (
          <Section title={t("owner.title")}><p className="muted text-sm">{t("owner.enter")}</p></Section>
        ) : (
          <>
            <Section title={t("owner.title")}>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                {([
                  ["owner.tile.paid", `${usd(o.purchasePrice)} · ${when(o.purchaseDate)}`],
                  ["owner.tile.now", usd(today)],
                  ["owner.tile.gain", `${s.gain < 0 ? "−" : "+"}${usd(Math.abs(s.gain))} (${signedPct(s.gainPct)})`],
                  ["owner.tile.held", t("owner.held", { years: num(n.dec1(s.years)) })],
                  ["owner.tile.cagr", s.cagrPct === null ? t("owner.cagr.na") : `${signedPct(s.cagrPct)} ${t("owner.perYear")}`],
                  ...(s.gainAfterImprovements !== null ? [["owner.tile.afterImp", `${s.gainAfterImprovements < 0 ? "−" : "+"}${usd(Math.abs(s.gainAfterImprovements))}`] as const] : []),
                ] as const).map(([l, v]) => (
                  <div key={l} className="rounded-xl p-3" style={{ background: "var(--surface-2)" }}>
                    <dt className="muted text-xs font-semibold uppercase">{t(l)}</dt>
                    <dd className="font-bold" dir="auto">{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>
            <Section title={t("owner.market.title")}>
              {!ent.can("marketUpdates") ? <UpgradeNotice feature="marketUpdates" compact />
                : !country ? <p className="muted text-sm">{t("owner.market.noCountry")}</p>
                : !market || market.kind === "loading" ? <p className="muted text-sm" role="status">{t("market.loading")}</p>
                : market.kind === "error" ? <p className="text-sm" style={{ color: "var(--warn)" }}>{t("market.unavailable")}</p>
                : market.kind !== "ready" ? <p className="muted text-sm">{t("owner.market.noData", { country: localName })}</p>
                : !path || path.vsMarketPct === null || path.expectedToday === null ? <p className="muted text-sm">{t("owner.market.short")}</p>
                : (
                  <>
                    <p className="text-sm">{t("owner.market.body", { country: localName, paid: usd(o.purchasePrice), expected: usd(path.expectedToday), value: usd(today), pct: signedPct(path.vsMarketPct) })}</p>
                    <p className="muted text-xs">{t("owner.history.note", { country: localName })}</p>
                  </>
                )}
            </Section>
          </>
        )}
        {!noComps && (
          <Section title={t("owner.proj.title")}>
            <p className="muted text-sm">{t("owner.proj.note")}</p>
            <ValueChart history={path?.points ?? []} rows={rows} todayTs={asOf.getTime()} />
          </Section>
        )}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ReportTabs id={project.id} current={audience} />
      <div className="no-print card flex flex-wrap items-end gap-3 p-4">
        <Link href={`/project/${project.id}`} className="btn">{t("report.back")}</Link>
        {ent.can("brandedReport") ? (
          <>
            <label className="field min-w-40 flex-1">{t("report.preparedForField")}
              <input className="input" dir="auto" value={project.preparedFor ?? ""} onChange={(e) => update({ preparedFor: e.target.value })} onBlur={persist} />
            </label>
            <label className="field min-w-40 flex-1">{t("report.preparedByField")}
              <input className="input" dir="auto" value={project.preparedBy ?? ""} onChange={(e) => update({ preparedBy: e.target.value })} onBlur={persist} />
            </label>
          </>
        ) : <div className="min-w-40 flex-1"><UpgradeNotice feature="brandedReport" compact /></div>}
        {ent.can(feature) && <GatedButton allowed={ent.can("printSummary")} feature="printSummary" className="btn btn-primary" onClick={() => window.print()}>{t("common.print")}</GatedButton>}
      </div>

      {!ent.can(feature) ? (
        <section className="card mx-auto max-w-2xl space-y-3 p-8 text-center">
          <h1 className="display text-3xl font-bold">{t(`feature.${feature}`)}</h1>
          <UpgradeNotice feature={feature} />
        </section>
      ) : (
        <>
          <header>
            <div className="muted flex items-center gap-2 text-xs font-semibold uppercase tracking-widest">
              {whiteLabel && brand.logo && /* eslint-disable-next-line @next/next/no-img-element */ <img src={brand.logo} alt="" className="max-h-10 max-w-[10rem] object-contain" />}
              <span translate="no"><bdi>{product}</bdi></span> · {t(`audience.kind.${audience}`)}
            </div>
            <h1 className="display mt-1 text-4xl font-bold"><bdi>{project.subject.address || project.name}</bdi></h1>
            <p className="muted mt-1 text-sm">{byline}</p>
            <div className="mt-3 h-px" style={{ background: "linear-gradient(90deg, var(--gold-b), transparent)" }} />
          </header>
          {body}
          <Section title={t("audience.importantTitle")}>
            <p className="text-sm">{t("lim.notAppraisal")}</p>
            <p className="muted text-sm">{t("lim.timing")}</p>
          </Section>
          <p className="muted pb-4 text-xs">{ent.can("brandedReport") && project.preparedBy ? t("report.footer.by", { date: dateStr, name: project.preparedBy, product }) : t("report.footer.noBy", { date: dateStr, product })}</p>
        </>
      )}
    </div>
  );
}
