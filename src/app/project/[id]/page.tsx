"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getProject, saveProject } from "@/lib/storage";
import { analyze, newComp, usd, type Comp, type Project, type Rates, type Subject } from "@/lib/comps";

const input = "w-full rounded border px-2 py-1";

function Num({ value, onChange, step }: { value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <input
      className={input}
      type="number"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
    />
  );
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState("");
  const loaded = useRef(false);

  useEffect(() => {
    getProject(id).then((p) => { setProject(p); loaded.current = true; });
  }, [id]);

  // Debounced autosave.
  useEffect(() => {
    if (!project || !loaded.current) return;
    setStatus("Saving…");
    const t = setTimeout(() => {
      saveProject(project).then(() => setStatus("Saved")).catch((e) => setStatus(`Save failed: ${e.message}`));
    }, 600);
    return () => clearTimeout(t);
  }, [project]);

  const analysis = useMemo(() => (project ? analyze(project) : null), [project]);

  if (!project || !analysis) return <p className="text-slate-500">Loading…</p>;

  const set = (patch: Partial<Project>) => setProject({ ...project, ...patch });
  const setSubject = (patch: Partial<Subject>) => set({ subject: { ...project.subject, ...patch } });
  const setRates = (patch: Partial<Rates>) => set({ rates: { ...project.rates, ...patch } });
  const setComp = (cid: string, patch: Partial<Comp>) =>
    set({ comps: project.comps.map((c) => (c.id === cid ? { ...c, ...patch } : c)) });

  return (
    <div className="space-y-6">
      <div className="no-print flex items-center justify-between gap-4">
        <input
          className="w-full max-w-md rounded border bg-white px-2 py-1 text-2xl font-semibold"
          value={project.name}
          onChange={(e) => set({ name: e.target.value })}
        />
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{status}</span>
          <button onClick={() => window.print()} className="rounded border bg-white px-3 py-1 hover:bg-slate-100">Print / save PDF</button>
        </div>
      </div>

      <section className="rounded border bg-white p-4">
        <h2 className="mb-3 font-semibold">1. Subject property</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <label className="col-span-2 text-sm">Address
            <input className={input} value={project.subject.address} onChange={(e) => setSubject({ address: e.target.value })} />
          </label>
          <label className="text-sm">Sq ft<Num value={project.subject.sqft} onChange={(n) => setSubject({ sqft: n })} /></label>
          <label className="text-sm">Beds<Num value={project.subject.beds} onChange={(n) => setSubject({ beds: n })} /></label>
          <label className="text-sm">Baths<Num step={0.5} value={project.subject.baths} onChange={(n) => setSubject({ baths: n })} /></label>
          <label className="text-sm">Year built<Num value={project.subject.yearBuilt} onChange={(n) => setSubject({ yearBuilt: n })} /></label>
        </div>
      </section>

      <section className="no-print rounded border bg-white p-4">
        <h2 className="mb-1 font-semibold">2. Adjustment rates</h2>
        <p className="mb-3 text-sm text-slate-500">Dollar value of one unit of difference. Edit to match your market; none of these are defaults you should rely on.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="text-sm">$ per sq ft<Num value={project.rates.perSqft} onChange={(n) => setRates({ perSqft: n })} /></label>
          <label className="text-sm">$ per bedroom<Num value={project.rates.perBed} onChange={(n) => setRates({ perBed: n })} /></label>
          <label className="text-sm">$ per bath<Num value={project.rates.perBath} onChange={(n) => setRates({ perBath: n })} /></label>
          <label className="text-sm">$ per year of age<Num value={project.rates.perYear} onChange={(n) => setRates({ perYear: n })} /></label>
        </div>
      </section>

      <section className="rounded border bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">3. Comparable sales</h2>
          <button className="no-print rounded bg-blue-600 px-3 py-1 text-white" onClick={() => set({ comps: [...project.comps, newComp()] })}>Add comp</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="no-print p-1">Use</th><th className="p-1">Address</th><th className="p-1">Sale price</th>
                <th className="p-1">Sale date</th><th className="p-1">Sq ft</th><th className="p-1">Beds</th><th className="p-1">Baths</th>
                <th className="p-1">Year</th><th className="p-1">Miles</th><th className="p-1">Other adj $</th>
                <th className="p-1 text-right">Net adj</th><th className="p-1 text-right">Adjusted</th><th className="no-print p-1" />
              </tr>
            </thead>
            <tbody>
              {project.comps.map((c) => {
                const row = analysis.rows.find((r) => r.comp.id === c.id);
                return (
                  <tr key={c.id} className={c.included ? "" : "opacity-50"}>
                    <td className="no-print p-1"><input type="checkbox" checked={c.included} onChange={(e) => setComp(c.id, { included: e.target.checked })} /></td>
                    <td className="p-1"><input className={input} value={c.address} onChange={(e) => setComp(c.id, { address: e.target.value })} /></td>
                    <td className="p-1"><Num value={c.salePrice} onChange={(n) => setComp(c.id, { salePrice: n })} /></td>
                    <td className="p-1"><input className={input} type="date" value={c.saleDate} onChange={(e) => setComp(c.id, { saleDate: e.target.value })} /></td>
                    <td className="p-1"><Num value={c.sqft} onChange={(n) => setComp(c.id, { sqft: n })} /></td>
                    <td className="p-1"><Num value={c.beds} onChange={(n) => setComp(c.id, { beds: n })} /></td>
                    <td className="p-1"><Num step={0.5} value={c.baths} onChange={(n) => setComp(c.id, { baths: n })} /></td>
                    <td className="p-1"><Num value={c.yearBuilt} onChange={(n) => setComp(c.id, { yearBuilt: n })} /></td>
                    <td className="p-1"><Num step={0.1} value={c.distanceMi} onChange={(n) => setComp(c.id, { distanceMi: n })} /></td>
                    <td className="p-1"><Num value={c.otherAdj} onChange={(n) => setComp(c.id, { otherAdj: n })} /></td>
                    <td className="p-1 text-right">{row ? usd(row.netAdj) : "—"}{row && row.grossAdjPct > 25 && <span title="Gross adjustments over 25% of sale price" className="ml-1 text-amber-600">⚠</span>}</td>
                    <td className="p-1 text-right font-medium">{row ? usd(row.adjustedPrice) : "—"}</td>
                    <td className="no-print p-1"><button className="text-red-600" onClick={() => set({ comps: project.comps.filter((x) => x.id !== c.id) })}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {project.comps.length === 0 && <p className="mt-2 text-slate-500">Add at least three comps for a meaningful range.</p>}
      </section>

      <section className="rounded border bg-white p-4">
        <h2 className="mb-3 font-semibold">4. Result</h2>
        {analysis.count === 0 ? (
          <p className="text-slate-500">Include at least one comp to see a value range.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ["Low", analysis.low],
              ["Median", analysis.median],
              ["Mean", analysis.mean],
              ["Weighted", analysis.weighted],
              ["High", analysis.high],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded bg-slate-50 p-3">
                <div className="text-xs uppercase text-slate-500">{label}</div>
                <div className="text-xl font-semibold">{usd(v as number)}</div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">
          This is a comparative market analysis for discussion purposes only. It is not an appraisal and must not be used for lending decisions.
        </p>
      </section>
    </div>
  );
}
