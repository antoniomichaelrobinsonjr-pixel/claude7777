"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject, saveProject } from "@/lib/storage";
import { analyze, type Project } from "@/lib/comps";
import { buildReport, type Grade } from "@/lib/report";
import { useI18n } from "@/i18n";
import { n } from "@/i18n/format";
import { DistanceBars, TrendChart } from "./charts";

const MapView = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => <div className="h-[380px] animate-pulse rounded-xl" style={{ background: "var(--surface-2)" }} role="status" aria-label="…" />,
});

const GRADE_COLOR: Record<Grade, string> = { High: "var(--ok)", Moderate: "var(--accent)", Limited: "var(--warn)", Low: "var(--danger)" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card break-inside-avoid p-6">
      <h2 className="display mb-4 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { t, tm, rich, usd, num, date } = useI18n();
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    getProject(id).then((p) => { setProject(p); setMissing(!p); }).catch(() => setMissing(true));
  }, [id]);

  const asOf = useMemo(() => new Date(), []);
  const report = useMemo(() => (project ? buildReport(project, asOf) : null), [project, asOf]);
  const analysis = useMemo(() => (project ? analyze(project) : null), [project]);

  if (missing)
    return (
      <div className="card space-y-3 p-8 text-center">
        <h1 className="text-xl font-semibold">{t("missing.title")}</h1>
        <Link href="/" className="btn btn-primary">{t("missing.back")}</Link>
      </div>
    );
  if (!project || !report || !analysis) return <p className="muted">{t("common.loading")}</p>;

  const update = (patch: Partial<Project>) => {
    const next = { ...project, ...patch };
    setProject(next);
    return next;
  };
  const dateStr = date(asOf);
  const totalW = report.comps.reduce((s, c) => s + c.weight, 0) || 1;
  const mi = (v: number, dp: "dec1" | "dec2" = "dec1") => t("common.unit.mi", { value: num(n[dp](v)) });
  const signed = (v: number) => `${v < 0 ? "−" : "+"}${usd(Math.abs(v))}`;
  const nameOf = (a: string) => a || t("common.unnamedComp");
  const bold = { b: (x: string, i: number) => <strong key={i}>{x}</strong> };
  const byline = [
    project.preparedFor && t("report.byline.for", { name: project.preparedFor }),
    project.preparedBy && t("report.byline.by", { name: project.preparedBy }),
    dateStr,
  ].filter(Boolean).join(" · ");
  const basisKey = report.distanceBasis === "none" ? null : `distance.basis.${report.distanceBasis}`;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="no-print card flex flex-wrap items-end gap-3 p-4">
        <Link href={`/project/${project.id}`} className="btn">{t("report.back")}</Link>
        <label className="field min-w-40 flex-1">{t("report.preparedForField")}
          <input className="input" value={project.preparedFor ?? ""} onChange={(e) => update({ preparedFor: e.target.value })} onBlur={() => saveProject(project)} />
        </label>
        <label className="field min-w-40 flex-1">{t("report.preparedByField")}
          <input className="input" value={project.preparedBy ?? ""} onChange={(e) => update({ preparedBy: e.target.value })} onBlur={() => saveProject(project)} />
        </label>
        <button className="btn btn-primary" onClick={() => window.print()}>{t("common.print")}</button>
      </div>

      <details className="no-print card p-4">
        <summary className="cursor-pointer text-sm font-semibold">{t("weights.summary")}</summary>
        <p className="muted mt-2 text-sm">{t("weights.intro")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {report.factors.map((f) => (
            <label key={f.key} className="field">{t(`factor.${f.key}.label`)}
              <select
                className="input"
                value={f.weight}
                onChange={(e) => saveProject(update({ checkWeights: { ...project.checkWeights, [f.key]: Number(e.target.value) } }))}
              >
                {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i === 0 ? t("weights.ignore") : i === 1 ? t("weights.normal") : num(n.int(i))}</option>)}
              </select>
            </label>
          ))}
        </div>
        <button className="btn mt-3" disabled={!report.customWeights} onClick={() => saveProject(update({ checkWeights: undefined }))}>{t("weights.reset")}</button>
      </details>

      <header>
        <div className="muted text-xs font-semibold uppercase tracking-widest"><span translate="no">CompPilot</span> · {t("report.kind")}</div>
        <h1 className="display mt-1 text-4xl font-bold">{project.subject.address || project.name}</h1>
        <p className="muted mt-1 text-sm">{byline}</p>
        <div className="mt-3 h-px" style={{ background: "linear-gradient(90deg, var(--gold-b), transparent)" }} />
      </header>

      {report.count === 0 ? (
        <Section title={t("report.empty.title")}>
          <p className="muted">{t("report.empty.body")}</p>
        </Section>
      ) : (
        <>
          <section className="card break-inside-avoid overflow-hidden">
            <div className="grid gap-px md:grid-cols-[1.4fr_1fr]" style={{ background: "var(--border)" }}>
              <div className="p-6" style={{ background: "linear-gradient(135deg, var(--panel-a), var(--panel-b))", color: "var(--panel-ink)" }}>
                <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{t("report.indicated")}</div>
                <div className="display gold-text mt-1 text-5xl font-bold">{usd(analysis.weighted)}</div>
                <div className="mt-2 text-sm opacity-90">
                  {t("report.rangeLine", { low: usd(analysis.low), high: usd(analysis.high), median: usd(analysis.median) })}
                </div>
                <div className="mt-1 text-xs opacity-70">{t("report.fromComps", { count: report.count })}</div>
              </div>
              <div className="flex flex-col justify-center p-6" style={{ background: "var(--surface)" }}>
                <div className="muted text-xs font-semibold uppercase tracking-wider">{t("report.reliability")}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="display text-4xl font-bold" style={{ color: GRADE_COLOR[report.grade] }}>{t(`grade.${report.grade}`)}</span>
                  <span className="muted text-sm">{t("report.scoreOf", { score: num(n.int(report.score)) })}</span>
                </div>
                <p className="mt-2 text-sm">{t(`verdict.${report.grade}`)}</p>
              </div>
            </div>
            {report.customWeights && (
              <p className="border-t p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--warn)" }}>
                {t("report.customNote", { score: num(n.int(report.equalWeightScore)), grade: t(`grade.${report.equalWeightGrade}`) })}
              </p>
            )}
            {report.caps.length > 0 && (
              <ul className="space-y-1 border-t p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--warn)" }}>
                {report.caps.map((c) => <li key={c.key}>⚠ {tm(c)}</li>)}
              </ul>
            )}
          </section>

          <Section title={t("howReliable.title")}>
            <p className="muted mb-4 text-sm">{t("howReliable.intro")}</p>
            <ul className="space-y-4">
              {report.factors.map((f) => (
                <li key={f.key}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{t(`factor.${f.key}.label`)}</span>
                    <span className="text-sm font-semibold">
                      {f.score === null ? t("common.notProvided") : t("report.scoreOf", { score: num(n.int(f.score)) })}
                      <span className="muted font-normal"> · {t("howReliable.counts", { pct: num(n.pct0(f.weightPct)) })}</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                    <div className="h-full rounded-full" style={{ width: `${f.score ?? 0}%`, background: "linear-gradient(90deg, var(--gold-a), var(--gold-b))" }} />
                  </div>
                  <div className="mt-1 text-sm">{tm(f.value)}</div>
                  <div className="muted text-xs">{t(`factor.${f.key}.rule`)}</div>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={t("table.title")}>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("table.aria")}>
              <table className="w-full min-w-[640px] text-start text-sm">
                <thead className="muted text-xs uppercase">
                  <tr>
                    <th className="py-2 pe-3 text-start">{t("col.property")}</th><th className="pe-3 text-start">{t("col.sold")}</th><th className="pe-3 text-start">{t("col.distance")}</th>
                    <th className="pe-3 text-end">{t("col.salePrice")}</th><th className="pe-3 text-end">{t("col.netAdj")}</th><th className="pe-3 text-end">{t("col.adjusted")}</th><th className="text-end">{t("col.weight")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.comps.map((c) => (
                    <tr key={c.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                      <td className="py-3 pe-3">
                        <div className="font-semibold">{nameOf(c.address)}</div>
                        {c.source && <div className="muted text-xs">{t("table.source", { source: c.source })}</div>}
                        {c.flags.length > 0 && <div className="mt-1 text-xs" style={{ color: "var(--warn)" }}>{c.flags.map((f) => tm(f)).join(" · ")}</div>}
                      </td>
                      <td className="pe-3">{c.ageDays === null ? "—" : c.ageDays < 0 ? t("table.futureDate") : t("table.daysAgo", { count: c.ageDays })}</td>
                      <td className="pe-3">{c.distanceMi === null ? "—" : mi(c.distanceMi)}</td>
                      <td className="pe-3 text-end">{usd(c.salePrice)}</td>
                      <td className="pe-3 text-end" dir="ltr">{c.netAdjPct >= 0 ? "+" : "−"}{num(n.pct1(Math.abs(c.netAdjPct)))}</td>
                      <td className="pe-3 text-end font-semibold">{usd(c.adjustedPrice)}</td>
                      <td className="text-end">{num(n.pct0((c.weight / totalW) * 100))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={t("trend.title")}>
            <TrendChart trend={report.trend} />
          </Section>

          <Section title={t("map.title")}>
            {report.subjectGeo === null && report.mapped === 0 ? (
              <p className="muted text-sm">{rich("map.notLocated", {}, bold)}</p>
            ) : (
              <>
                <MapView
                  subject={report.subjectGeo ? { address: project.subject.address, geo: report.subjectGeo } : null}
                  comps={report.comps.flatMap((c, i) => (c.geo ? [{ n: i + 1, address: c.address, salePrice: c.salePrice, adjustedPrice: c.adjustedPrice, geo: c.geo, mapDistanceMi: c.mapDistanceMi }] : []))}
                />
                <p className="muted mt-2 text-xs">{rich("map.legend", {}, bold)}</p>
                <details className="mt-2 text-sm">
                  <summary className="muted tap cursor-pointer">{t("common.viewTable")}</summary>
                  <table className="mt-2 w-full min-w-[520px] text-start">
                    <thead className="muted text-xs uppercase">
                      <tr><th className="py-1 pe-3 text-start">{t("col.num")}</th><th className="pe-3 text-start">{t("col.property")}</th><th className="pe-3 text-start">{t("col.matched")}</th><th className="text-end">{t("col.mapDistance")}</th></tr>
                    </thead>
                    <tbody>
                      {report.subjectGeo && (
                        <tr className="border-t" style={{ borderColor: "var(--border)" }}><td className="py-1 pe-3">S</td><td className="pe-3">{project.subject.address}</td><td className="pe-3">{report.subjectGeo.label}</td><td className="text-end">—</td></tr>
                      )}
                      {report.comps.map((c, i) => (
                        <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="py-1 pe-3">{num(n.int(i + 1))}</td><td className="pe-3">{nameOf(c.address)}</td>
                          <td className="pe-3">{c.geo ? `${c.geo.label}${c.geo.precise ? "" : t("map.areaOnly")}` : t("map.notLocatedCell")}</td>
                          <td className="text-end">{c.mapDistanceMi === null ? "—" : mi(c.mapDistanceMi, "dec2")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            )}
          </Section>

          <Section title={t("distance.title")}>
            <DistanceBars comps={report.comps} />
            {basisKey && <p className="muted mt-2 text-xs">{t(basisKey)}</p>}
          </Section>

          <Section title={t("method.title")}>
            <ol className="list-decimal space-y-2 ps-5 text-sm">
              {(["method.1", "method.2"] as const).map((k) => (
                <li key={k}>{rich(k, {}, { i: (x, i) => <em key={i}>{x}</em> })}</li>
              ))}
              <li>{t("method.3")}</li>
            </ol>
            <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label={t("method.breakdownAria")}>
              <table className="w-full min-w-[560px] text-start text-sm">
                <thead className="muted text-xs uppercase">
                  <tr>
                    <th className="py-2 pe-3 text-start">{t("col.property")}</th><th className="pe-3 text-end">{t("col.size")}</th><th className="pe-3 text-end">{t("col.beds")}</th>
                    <th className="pe-3 text-end">{t("col.baths")}</th><th className="pe-3 text-end">{t("col.age")}</th><th className="pe-3 text-end">{t("col.extra")}</th><th className="text-end">{t("col.net")}</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.rows.map((r) => (
                    <tr key={r.comp.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 pe-3">{nameOf(r.comp.address)}</td>
                      <td className="pe-3 text-end" dir="ltr">{signed(r.sqftAdj)}</td><td className="pe-3 text-end" dir="ltr">{signed(r.bedAdj)}</td>
                      <td className="pe-3 text-end" dir="ltr">{signed(r.bathAdj)}</td><td className="pe-3 text-end" dir="ltr">{signed(r.ageAdj)}</td>
                      <td className="pe-3 text-end" dir="ltr">{signed(r.comp.otherAdj)}</td><td className="text-end font-semibold" dir="ltr">{signed(r.netAdj)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm">
              {rich("method.rates", { sqft: usd(project.rates.perSqft), bed: usd(project.rates.perBed), bath: usd(project.rates.perBath), year: usd(project.rates.perYear) }, bold)}
            </p>
            <p className="mt-1 text-sm">
              <strong>{t("method.basisLabel")}</strong>{" "}
              {project.ratesBasis?.trim() || <span style={{ color: "var(--warn)" }}>{t("method.notRecorded")}</span>}
            </p>
          </Section>

          <Section title={t("limits.title")}>
            <ul className="list-disc space-y-2 ps-5 text-sm">
              {report.limitations.map((l, i) => <li key={`${l.key}-${i}`}>{tm(l)}</li>)}
            </ul>
          </Section>
        </>
      )}

      <footer className="muted pb-6 text-xs leading-5">
        {project.preparedBy ? t("report.footer.by", { date: dateStr, name: project.preparedBy }) : t("report.footer.noBy", { date: dateStr })}
      </footer>
    </div>
  );
}
