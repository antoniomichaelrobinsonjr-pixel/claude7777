"use client";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject, saveProject } from "@/lib/storage";
import { analyze, usd, type Project } from "@/lib/comps";
import { buildReport, type Grade } from "@/lib/report";
import { DistanceBars, TrendChart } from "./charts";

const MapView = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => <div className="h-[380px] animate-pulse rounded-xl" style={{ background: "var(--surface-2)" }} aria-label="Loading map" />,
});

const pct = (n: number, d = 1) => `${n.toFixed(d)}%`;
const signed = (n: number) => `${n < 0 ? "−" : "+"}${usd(Math.abs(n))}`;
const GRADE_COLOR: Record<Grade, string> = { High: "var(--ok)", Moderate: "var(--accent)", Limited: "var(--warn)", Low: "var(--danger)" };
const VERDICT: Record<Grade, string> = {
  High: "The inputs are well supported: enough recent, nearby, closely matched comparable sales that agree with one another.",
  Moderate: "The inputs give reasonable support, with the gaps listed under 'Assumptions and limitations' below.",
  Limited: "The inputs give limited support. Treat the value as a rough indication, not a firm figure.",
  Low: "The inputs do not yet support a dependable value. Add or improve comparable sales before relying on it.",
};

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
        <h1 className="text-xl font-semibold">We couldn't find that analysis</h1>
        <Link href="/" className="btn btn-primary">Back to your analyses</Link>
      </div>
    );
  if (!project || !report || !analysis) return <p className="muted">Loading…</p>;

  const update = (patch: Partial<Project>) => {
    const next = { ...project, ...patch };
    setProject(next);
    return next;
  };
  const dateStr = asOf.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const totalW = report.comps.reduce((s, c) => s + c.weight, 0) || 1;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="no-print card flex flex-wrap items-end gap-3 p-4">
        <Link href={`/project/${project.id}`} className="btn">← Back to analysis</Link>
        <label className="field min-w-40 flex-1">Prepared for
          <input className="input" value={project.preparedFor ?? ""} onChange={(e) => update({ preparedFor: e.target.value })} onBlur={() => saveProject(project)} />
        </label>
        <label className="field min-w-40 flex-1">Prepared by
          <input className="input" value={project.preparedBy ?? ""} onChange={(e) => update({ preparedBy: e.target.value })} onBlur={() => saveProject(project)} />
        </label>
        <button className="btn btn-primary" onClick={() => window.print()}>Print / save PDF</button>
      </div>

      <details className="no-print card p-4">
        <summary className="cursor-pointer text-sm font-semibold">Adjust how much each reliability check counts</summary>
        <p className="muted mt-2 text-sm">
          All five count equally by default. If you change this, the report states that it was customised and shows what the score would be with equal weights, so readers can see the difference. Set a check to 0 to leave it out.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {report.factors.map((f) => (
            <label key={f.key} className="field">{f.label}
              <select
                className="input"
                value={f.weight}
                onChange={(e) => saveProject(update({ checkWeights: { ...project.checkWeights, [f.key]: Number(e.target.value) } }))}
              >
                {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i === 0 ? "0 (ignore)" : i === 1 ? "1 (normal)" : i}</option>)}
              </select>
            </label>
          ))}
        </div>
        <button className="btn mt-3" disabled={!report.customWeights} onClick={() => saveProject(update({ checkWeights: undefined }))}>Reset to equal weights</button>
      </details>

      <header>
        <div className="muted text-xs font-semibold uppercase tracking-widest">CompPilot · Valuation Support Report</div>
        <h1 className="display mt-1 text-4xl font-bold">{project.subject.address || project.name}</h1>
        <p className="muted mt-1 text-sm">
          {[project.preparedFor && `Prepared for ${project.preparedFor}`, project.preparedBy && `by ${project.preparedBy}`, dateStr].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-3 h-px" style={{ background: "linear-gradient(90deg, var(--gold-b), transparent)" }} />
      </header>

      {report.count === 0 ? (
        <Section title="No comparable sales yet">
          <p className="muted">Add at least one comparable sale with a price to generate this report.</p>
        </Section>
      ) : (
        <>
          <section className="card break-inside-avoid overflow-hidden">
            <div className="grid gap-px md:grid-cols-[1.4fr_1fr]" style={{ background: "var(--border)" }}>
              <div className="p-6" style={{ background: "linear-gradient(135deg, var(--panel-a), var(--panel-b))", color: "var(--panel-ink)" }}>
                <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Indicated value (weighted)</div>
                <div className="display gold-text mt-1 text-5xl font-bold">{usd(analysis.weighted)}</div>
                <div className="mt-2 text-sm opacity-90">
                  Range {usd(analysis.low)} – {usd(analysis.high)} · median {usd(analysis.median)}
                </div>
                <div className="mt-1 text-xs opacity-70">From {report.count} comparable sale{report.count === 1 ? "" : "s"}, each adjusted to match the subject.</div>
              </div>
              <div className="flex flex-col justify-center p-6" style={{ background: "var(--surface)" }}>
                <div className="muted text-xs font-semibold uppercase tracking-wider">Reliability of the inputs</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="display text-4xl font-bold" style={{ color: GRADE_COLOR[report.grade] }}>{report.grade}</span>
                  <span className="muted text-sm">{report.score}/100</span>
                </div>
                <p className="mt-2 text-sm">{VERDICT[report.grade]}</p>
              </div>
            </div>
            {report.customWeights && (
              <p className="border-t p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--warn)" }}>
                ⚠ The reliability checks were weighted by the preparer. With equal weights the score would be {report.equalWeightScore}/100 ({report.equalWeightGrade}).
              </p>
            )}
            {report.caps.length > 0 && (
              <ul className="space-y-1 border-t p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--warn)" }}>
                {report.caps.map((c) => <li key={c}>⚠ {c}</li>)}
              </ul>
            )}
          </section>

          <Section title="How reliable is this estimate?">
            <p className="muted mb-4 text-sm">
              Five checks, each scored 0–100 from the data entered, then averaged. A check with missing data scores zero, so leaving fields blank can never improve the result.
            </p>
            <ul className="space-y-4">
              {report.factors.map((f) => (
                <li key={f.key}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{f.label}</span>
                    <span className="text-sm font-semibold">
                      {f.score === null ? "Not provided" : `${Math.round(f.score)}/100`}
                      <span className="muted font-normal"> · counts {f.weightPct === 0 ? "0" : Math.round(f.weightPct)}%</span>
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                    <div className="h-full rounded-full" style={{ width: `${f.score ?? 0}%`, background: "linear-gradient(90deg, var(--gold-a), var(--gold-b))" }} />
                  </div>
                  <div className="mt-1 text-sm">{f.value}</div>
                  <div className="muted text-xs">{f.rule}</div>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="The comparable sales">
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Comparable sales table">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="muted text-xs uppercase">
                  <tr><th className="py-2 pr-3">Property</th><th className="pr-3">Sold</th><th className="pr-3">Distance</th><th className="pr-3 text-right">Sale price</th><th className="pr-3 text-right">Net adj.</th><th className="pr-3 text-right">Adjusted</th><th className="text-right">Weight</th></tr>
                </thead>
                <tbody>
                  {report.comps.map((c) => (
                    <tr key={c.id} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
                      <td className="py-3 pr-3">
                        <div className="font-semibold">{c.address}</div>
                        {c.source && <div className="muted text-xs">Source: {c.source}</div>}
                        {c.flags.length > 0 && <div className="mt-1 text-xs" style={{ color: "var(--warn)" }}>{c.flags.join(" · ")}</div>}
                      </td>
                      <td className="pr-3">{c.ageDays === null ? "—" : c.ageDays < 0 ? "Future date" : `${c.ageDays} days ago`}</td>
                      <td className="pr-3">{c.distanceMi === null ? "—" : `${c.distanceMi.toFixed(1)} mi`}</td>
                      <td className="pr-3 text-right">{usd(c.salePrice)}</td>
                      <td className="pr-3 text-right">{c.netAdjPct >= 0 ? "+" : "−"}{pct(Math.abs(c.netAdjPct))}</td>
                      <td className="pr-3 text-right font-semibold">{usd(c.adjustedPrice)}</td>
                      <td className="text-right">{pct((c.weight / totalW) * 100, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Sale price per sq ft over time">
            <TrendChart trend={report.trend} />
          </Section>

          <Section title="Map">
            {report.subjectGeo === null && report.mapped === 0 ? (
              <p className="muted text-sm">
                The addresses have not been located yet. Open the analysis and use <strong>Locate addresses</strong> to add a map and measure distances from it.
              </p>
            ) : (
              <>
                <MapView
                  subject={report.subjectGeo ? { address: project.subject.address, geo: report.subjectGeo } : null}
                  comps={report.comps.flatMap((c, i) => (c.geo ? [{ n: i + 1, address: c.address, salePrice: c.salePrice, adjustedPrice: c.adjustedPrice, geo: c.geo, mapDistanceMi: c.mapDistanceMi }] : []))}
                />
                <p className="muted mt-2 text-xs">
                  <strong>S</strong> is the subject property; numbers match the comps in order. The gold ring is one mile from the subject. Positions come from an address lookup and are only as precise as the match listed below. Map data © OpenStreetMap contributors.
                </p>
                <details className="mt-2 text-sm">
                  <summary className="muted tap cursor-pointer">View as table</summary>
                  <table className="mt-2 w-full min-w-[520px] text-left">
                    <thead className="muted text-xs uppercase"><tr><th className="py-1 pr-3">#</th><th className="pr-3">Property</th><th className="pr-3">Matched address</th><th className="text-right">Map distance</th></tr></thead>
                    <tbody>
                      {report.subjectGeo && (
                        <tr className="border-t" style={{ borderColor: "var(--border)" }}><td className="py-1 pr-3">S</td><td className="pr-3">{project.subject.address}</td><td className="pr-3">{report.subjectGeo.label}</td><td className="text-right">—</td></tr>
                      )}
                      {report.comps.map((c, i) => (
                        <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                          <td className="py-1 pr-3">{i + 1}</td><td className="pr-3">{c.address}</td>
                          <td className="pr-3">{c.geo ? `${c.geo.label}${c.geo.precise ? "" : " (area only)"}` : "Not located"}</td>
                          <td className="text-right">{c.mapDistanceMi === null ? "—" : `${c.mapDistanceMi.toFixed(2)} mi`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </>
            )}
          </Section>

          <Section title="Distance from the subject property">
            <DistanceBars comps={report.comps} />
            <p className="muted mt-2 text-xs">
              {report.distanceBasis === "map" ? "Every distance was measured, or checked, against straight-line map distances between located addresses. A straight line is the shortest possible route, so where an entered distance was shorter, the map distance is used." : report.distanceBasis === "mixed" ? "Some distances were measured or checked on the map (a straight line is the shortest possible route, so the map distance is used where an entered one was shorter); the rest were entered by the preparer and are unchecked." : report.distanceBasis === "entered" ? "Distances were entered by the preparer and have not been checked against a map." : ""}
            </p>
          </Section>

          <Section title="Method">
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Each comparable sale is adjusted toward the subject: <em>(subject − comp) × rate</em> for size, bedrooms, bathrooms and age, plus any manual adjustment. If the subject is larger or newer, the comp's price goes up.</li>
              <li>Comps needing smaller adjustments count more: <em>weight = 1 ÷ (1 + gross adjustment % ÷ 10)</em>. The indicated value is the weighted average of the adjusted prices.</li>
              <li>The range is the lowest and highest adjusted price, so it shows how far the comps disagree.</li>
            </ol>
            <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Adjustment breakdown table">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="muted text-xs uppercase">
                  <tr><th className="py-2 pr-3">Property</th><th className="pr-3 text-right">Size</th><th className="pr-3 text-right">Beds</th><th className="pr-3 text-right">Baths</th><th className="pr-3 text-right">Age</th><th className="pr-3 text-right">Other</th><th className="text-right">Net</th></tr>
                </thead>
                <tbody>
                  {analysis.rows.map((r) => (
                    <tr key={r.comp.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <td className="py-2 pr-3">{r.comp.address || "Unnamed comp"}</td>
                      <td className="pr-3 text-right">{signed(r.sqftAdj)}</td><td className="pr-3 text-right">{signed(r.bedAdj)}</td>
                      <td className="pr-3 text-right">{signed(r.bathAdj)}</td><td className="pr-3 text-right">{signed(r.ageAdj)}</td>
                      <td className="pr-3 text-right">{signed(r.comp.otherAdj)}</td><td className="text-right font-semibold">{signed(r.netAdj)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm">
              <strong>Adjustment rates used:</strong> {usd(project.rates.perSqft)} per sq ft · {usd(project.rates.perBed)} per bedroom · {usd(project.rates.perBath)} per bath · {usd(project.rates.perYear)} per year of age.
            </p>
            <p className="mt-1 text-sm"><strong>Basis for the rates:</strong> {project.ratesBasis?.trim() || <span style={{ color: "var(--warn)" }}>Not recorded.</span>}</p>
          </Section>

          <Section title="Assumptions and limitations">
            <ul className="list-disc space-y-2 pl-5 text-sm">
              {report.limitations.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </Section>
        </>
      )}

      <footer className="muted pb-6 text-xs leading-5">
        Prepared {dateStr}{project.preparedBy ? ` by ${project.preparedBy}` : ""}. This report summarises the data and assumptions entered by the preparer; CompPilot has not independently verified any sale, source or rate. Comparative market analysis for discussion only. Not an appraisal; not for lending decisions.
      </footer>
    </div>
  );
}
