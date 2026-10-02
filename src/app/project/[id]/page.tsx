"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject, saveProject } from "@/lib/storage";
import { analyze, exampleData, newComp, usd, type Analysis, type Comp, type Project, type Rates, type Subject } from "@/lib/comps";

function Num({ label, value, onChange, step }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <label className="field">
      {label}
      <input
        className="input"
        type="number"
        inputMode="decimal"
        step={step}
        placeholder="0"
        value={Number.isFinite(value) && value !== 0 ? value : ""}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </label>
  );
}

/** Dollar input that shows thousands separators while you type. */
function Money({ label, value, onChange, negative }: { label: string; value: number; onChange: (n: number) => void; negative?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const fmt = (n: number) => (n === 0 ? "" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  function handle(raw: string) {
    const neg = negative && raw.trim().startsWith("-");
    const digits = raw.replace(/[^0-9.]/g, "");
    const dot = digits.indexOf(".");
    const int = (dot < 0 ? digits : digits.slice(0, dot)).replace(/^0+(?=\d)/, "");
    const dec = dot < 0 ? null : digits.slice(dot + 1).replace(/\./g, "").slice(0, 2);
    const text = (neg ? "-" : "") + (int ? Number(int).toLocaleString("en-US") : neg || dec !== null ? "0" : "") + (dec !== null ? "." + dec : "");
    setDraft(text);
    onChange(parseFloat(text.replace(/,/g, "")) || 0);
  }
  return (
    <label className="field">
      {label}
      <div className="relative">
        <span className="muted pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm">$</span>
        <input
          className="input pl-6"
          inputMode={negative ? "text" : "decimal"}
          placeholder="0"
          value={draft ?? fmt(value)}
          onFocus={(e) => { setDraft(fmt(value)); e.target.select(); }}
          onChange={(e) => handle(e.target.value)}
          onBlur={() => setDraft(null)}
        />
      </div>
    </label>
  );
}

function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="step">{n}</span>
      <div>
        <h2 className="font-semibold leading-6">{title}</h2>
        {hint && <p className="muted text-sm">{hint}</p>}
      </div>
    </div>
  );
}

/** Horizontal range bar: every comp's adjusted price as a dot, weighted value as a marker. */
function RangeBar({ a }: { a: Analysis }) {
  const span = Math.max(a.high - a.low, 1);
  const pos = (v: number) => `${((v - a.low) / span) * 100}%`;
  return (
    <div className="px-2 pb-6 pt-8">
      <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg, var(--accent), var(--brand))", opacity: 0.35 }} />
      <div className="relative -mt-2 h-2">
        {a.rows.map((r) => (
          <span
            key={r.comp.id}
            title={`${r.comp.address || "Comp"}: ${usd(r.adjustedPrice)}`}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{ left: pos(r.adjustedPrice), background: "var(--surface)", borderColor: "var(--brand)" }}
          />
        ))}
        <span className="absolute -top-7 -translate-x-1/2 text-center text-[10px] font-semibold uppercase" style={{ left: `clamp(16%, ${a.high > a.low ? pos(a.weighted) : "50%"}, 84%)`, color: "var(--accent)" }}>
          ▼ Weighted
        </span>
      </div>
      <div className="muted mt-3 flex justify-between text-xs">
        <span>{usd(a.low)}</span>
        <span>{usd(a.high)}</span>
      </div>
    </div>
  );
}

const isBlankProject = (p: Project) =>
  !p.subject.address && !p.subject.sqft && p.comps.every((c) => !c.salePrice && !c.address);

const STEPS = ["Subject", "Rates", "Comps", "Result"];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState("");
  const [missing, setMissing] = useState(false);
  const [removed, setRemoved] = useState<{ comp: Comp; index: number } | null>(null);
  const [guided, setGuided] = useState(false);
  const [step, setStep] = useState(1);
  const loaded = useRef(false);

  useEffect(() => {
    getProject(id)
      .then((p) => {
        setProject(p);
        setMissing(!p);
        loaded.current = !!p;
        if (p && isBlankProject(p)) setGuided(true);
      })
      .catch(() => setMissing(true));
  }, [id]);

  // Debounced autosave.
  useEffect(() => {
    if (!project || !loaded.current) return;
    setStatus("Saving…");
    const t = setTimeout(() => {
      saveProject(project).then(() => setStatus("Saved ✓")).catch((e) => setStatus(`Save failed: ${e.message}`));
    }, 600);
    return () => clearTimeout(t);
  }, [project]);

  const analysis = useMemo(() => (project ? analyze(project) : null), [project]);

  if (missing) {
    return (
      <div className="card space-y-3 p-8 text-center">
        <h1 className="text-xl font-semibold">We couldn't find that analysis</h1>
        <p className="muted">It may have been deleted, or it was saved in a different browser or account.</p>
        <Link href="/" className="btn btn-primary">Back to your analyses</Link>
      </div>
    );
  }
  if (!project || !analysis) return <p className="muted">Loading…</p>;

  const isBlank = isBlankProject(project);
  // In guided mode only the current step shows; printing always shows everything.
  const show = (n: number) => (!guided || step === n ? "" : "hidden print:block");
  const stepHint =
    step === 1 && !project.subject.sqft ? "Add the square footage to continue." :
    step === 3 && analysis.count === 0 ? "Enter a sale price for at least one comp." : "";
  const canNext = !stepHint;

  const set = (patch: Partial<Project>) => setProject({ ...project, ...patch });
  const setSubject = (patch: Partial<Subject>) => set({ subject: { ...project.subject, ...patch } });
  const setRates = (patch: Partial<Rates>) => set({ rates: { ...project.rates, ...patch } });
  const duplicateComp = (cid: string) => {
    const i = project.comps.findIndex((c) => c.id === cid);
    if (i < 0) return;
    const copy = { ...project.comps[i], id: crypto.randomUUID() };
    const next = [...project.comps];
    next.splice(i + 1, 0, copy);
    set({ comps: next });
  };
  const setComp = (cid: string, patch: Partial<Comp>) =>
    set({ comps: project.comps.map((c) => (c.id === cid ? { ...c, ...patch } : c)) });

  return (
    <div className="space-y-6">
      <Link href="/" className="muted no-print inline-block text-sm hover:underline">← All analyses</Link>
      {isBlank && (
        <div className="card no-print flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span>Fill in the steps below, or just exploring?</span>
          <button className="btn" onClick={() => set(exampleData())}>Load example data</button>
        </div>
      )}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <input
          className="w-full max-w-md bg-transparent text-3xl font-bold tracking-tight outline-none focus:underline"
          value={project.name}
          onChange={(e) => set({ name: e.target.value })}
          aria-label="Analysis name"
        />
        <div className="flex items-center gap-3">
          <span className="muted text-sm">{status}</span>
          <button onClick={() => { setGuided(!guided); setStep(1); }} className="btn">
            {guided ? "Show all steps" : "Guide me"}
          </button>
          <button onClick={() => window.print()} className="btn">Print / save PDF</button>
        </div>
      </div>

      {guided && (
        <nav className="no-print card flex items-center gap-1 p-2" aria-label="Progress">
          {STEPS.map((t, i) => (
            <button
              key={t}
              onClick={() => setStep(i + 1)}
              aria-current={step === i + 1 ? "step" : undefined}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl px-2 py-2 text-sm font-semibold transition"
              style={step === i + 1 ? { background: "var(--brand)", color: "var(--brand-ink)" } : { color: step > i + 1 ? "var(--accent)" : "var(--muted)" }}
            >
              <span>{step > i + 1 ? "✓" : i + 1}</span>
              <span className="hidden sm:inline">{t}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className={`card p-5 ${show(1)}`}>
            <Step n={1} title="Subject property" hint="The home you are pricing." />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="field col-span-2 md:col-span-4">Address
                <input className="input" value={project.subject.address} onChange={(e) => setSubject({ address: e.target.value })} />
              </label>
              <Num label="Sq ft" value={project.subject.sqft} onChange={(n) => setSubject({ sqft: n })} />
              <Num label="Beds" value={project.subject.beds} onChange={(n) => setSubject({ beds: n })} />
              <Num label="Baths" step={0.5} value={project.subject.baths} onChange={(n) => setSubject({ baths: n })} />
              <Num label="Year built" value={project.subject.yearBuilt} onChange={(n) => setSubject({ yearBuilt: n })} />
            </div>
          </section>

          <section className={`card no-print p-5 ${show(2)}`}>
            <Step n={2} title="Adjustment rates" hint="Dollar value of one unit of difference. Set these from your market; the starting numbers are placeholders." />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Money label="Per sq ft" value={project.rates.perSqft} onChange={(n) => setRates({ perSqft: n })} />
              <Money label="Per bedroom" value={project.rates.perBed} onChange={(n) => setRates({ perBed: n })} />
              <Money label="Per bath" value={project.rates.perBath} onChange={(n) => setRates({ perBath: n })} />
              <Money label="Per year of age" value={project.rates.perYear} onChange={(n) => setRates({ perYear: n })} />
            </div>
          </section>

          {guided && step === 4 && (
            <section className="card no-print overflow-hidden">
              <h2 className="p-5 font-semibold">Your comps at a glance</h2>
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {analysis.rows.map((r) => (
                  <li key={r.comp.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm" style={{ borderColor: "var(--border)" }}>
                    <span className="truncate">{r.comp.address || "Unnamed comp"}</span>
                    <span className="muted whitespace-nowrap">{usd(r.comp.salePrice)} → <strong style={{ color: "var(--ink)" }}>{usd(r.adjustedPrice)}</strong></span>
                  </li>
                ))}
              </ul>
              <p className="muted p-5 text-sm">Not right? Use the steps above to edit anything — the value updates instantly.</p>
            </section>
          )}

          <section className={`space-y-3 ${show(3)}`}>
            <div className="flex items-center justify-between">
              <Step n={3} title="Comparable sales" hint="Recent sales of similar nearby homes." />
              <button className="btn btn-primary no-print" onClick={() => set({ comps: [...project.comps, newComp()] })}>+ Add comp</button>
            </div>
            {removed && (
              <div className="card no-print flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span>Comp removed.</span>
                <button
                  className="font-semibold hover:underline"
                  style={{ color: "var(--brand)" }}
                  onClick={() => {
                    const next = [...project.comps];
                    next.splice(removed.index, 0, removed.comp);
                    set({ comps: next });
                    setRemoved(null);
                  }}
                >Undo</button>
              </div>
            )}
            {project.comps.length === 0 && (
              <div className="card muted p-8 text-center">Add at least three comps for a meaningful range.</div>
            )}
            {project.comps.map((c, i) => {
              const row = analysis.rows.find((r) => r.comp.id === c.id);
              return (
                <div key={c.id} className="card p-5 transition" style={{ opacity: c.included ? 1 : 0.55 }}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold">Comp {i + 1}</span>
                    <div className="no-print flex items-center gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={c.included} onChange={(e) => setComp(c.id, { included: e.target.checked })} /> Use
                      </label>
                      <button className="muted hover:underline" onClick={() => duplicateComp(c.id)}>Duplicate</button>
                      <button
                        className="muted hover:underline"
                        onClick={() => {
                          setRemoved({ comp: c, index: i });
                          set({ comps: project.comps.filter((x) => x.id !== c.id) });
                        }}
                      >Remove</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <label className="field col-span-2">Address
                      <input className="input" value={c.address} onChange={(e) => setComp(c.id, { address: e.target.value })} />
                    </label>
                    <Money label="Sale price" value={c.salePrice} onChange={(n) => setComp(c.id, { salePrice: n })} />
                    <label className="field">Sale date
                      <input className="input" type="date" value={c.saleDate} onChange={(e) => setComp(c.id, { saleDate: e.target.value })} />
                    </label>
                    <Num label="Sq ft" value={c.sqft} onChange={(n) => setComp(c.id, { sqft: n })} />
                    <Num label="Beds" value={c.beds} onChange={(n) => setComp(c.id, { beds: n })} />
                    <Num label="Baths" step={0.5} value={c.baths} onChange={(n) => setComp(c.id, { baths: n })} />
                    <Num label="Year built" value={c.yearBuilt} onChange={(n) => setComp(c.id, { yearBuilt: n })} />
                    <Num label="Distance (mi)" step={0.1} value={c.distanceMi} onChange={(n) => setComp(c.id, { distanceMi: n })} />
                    <Money label="Other adjustment" negative value={c.otherAdj} onChange={(n) => setComp(c.id, { otherAdj: n })} />
                  </div>
                  {c.included && c.salePrice <= 0 && (
                    <p className="mt-4 text-sm" style={{ color: "var(--warn)" }}>Enter a sale price to include this comp in the value.</p>
                  )}
                  {row && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--surface-2)" }}>
                      <span className="muted">
                        Net adjustment <strong style={{ color: "var(--ink)" }}>{usd(row.netAdj)}</strong>
                        {row.grossAdjPct > 25 && (
                          <span className="ml-2" style={{ color: "var(--warn)" }} title="Gross adjustments over 25% of sale price">⚠ heavy adjustments</span>
                        )}
                      </span>
                      <span>Adjusted price <strong className="text-lg">{usd(row.adjustedPrice)}</strong></span>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {guided && (
            <div className="no-print flex items-center justify-between gap-3">
              <button className="btn" disabled={step === 1} onClick={() => setStep(step - 1)} style={step === 1 ? { visibility: "hidden" } : undefined}>← Back</button>
              <span className="text-sm" style={{ color: "var(--warn)" }}>{step < 4 ? stepHint : ""}</span>
              {step < 4 ? (
                <button className="btn btn-primary" disabled={!canNext} style={!canNext ? { opacity: 0.5, cursor: "not-allowed" } : undefined} onClick={() => setStep(step + 1)}>
                  {step === 3 ? "See result →" : "Next →"}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => window.print()}>Print / save PDF</button>
              )}
            </div>
          )}
        </div>

        <aside className={`lg:sticky lg:top-20 lg:self-start ${guided && step !== 4 ? "hidden lg:block print:block" : ""}`}>
          <div className="card overflow-hidden">
            <div className="p-5" style={{ background: "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 55%, var(--accent)))", color: "var(--brand-ink)" }}>
              <div className="text-xs font-semibold uppercase tracking-wider opacity-80">Weighted value</div>
              <div className="mt-1 text-4xl font-bold tracking-tight">{analysis.count ? usd(analysis.weighted) : "—"}</div>
              <div className="mt-1 text-sm opacity-80">{analysis.count} of {project.comps.length} comp{project.comps.length === 1 ? "" : "s"} used</div>
            </div>
            {analysis.count === 0 ? (
              <p className="muted p-5 text-sm">Enter a sale price for at least one comp to see a value range.</p>
            ) : (
              <>
                <RangeBar a={analysis} />
                <dl className="grid grid-cols-3 gap-2 px-5 pb-5 text-center">
                  {([["Low", analysis.low], ["Median", analysis.median], ["High", analysis.high]] as const).map(([l, v]) => (
                    <div key={l} className="rounded-xl p-2" style={{ background: "var(--surface-2)" }}>
                      <dt className="muted text-[10px] font-semibold uppercase">{l}</dt>
                      <dd className="text-sm font-bold">{usd(v)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            <p className="muted border-t px-5 py-3 text-xs leading-5" style={{ borderColor: "var(--border)" }}>
              <strong>How it's calculated:</strong> each comp's price is adjusted toward your subject, then averaged. Comps needing fewer adjustments count more.
            </p>
            <p className="muted border-t p-4 text-[11px] leading-4" style={{ borderColor: "var(--border)" }}>
              Comparative market analysis for discussion only. Not an appraisal; not for lending decisions.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
