"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProject, saveProject } from "@/lib/storage";
import { useI18n } from "@/i18n";
import { readMoney, showMoney, type Vars } from "@/i18n/format";
import { DEFAULT_GEOCODER_URL, GEOCODE_DELAY_MS, geocodeAddress, haversineMiles, validGeo } from "@/lib/geo";
import { analyze, exampleData, newComp, type Analysis, type Comp, type GeoPoint, type Project, type Rates, type Subject } from "@/lib/comps";

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

/** Dollar input that groups digits as you type, using the reader's own separators. */
function Money({ label, value, onChange, negative }: { label: string; value: number; onChange: (n: number) => void; negative?: boolean }) {
  const { info } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  function handle(raw: string) {
    const r = readMoney(raw, info.intl, negative);
    setDraft(r.text);
    onChange(r.value);
  }
  return (
    <label className="field">
      {label}
      <div className="relative">
        <span className="muted pointer-events-none absolute start-3 top-1/2 mt-0.5 -translate-y-1/2 text-sm" dir="ltr">$</span>
        <input
          className="input ps-6"
          dir="ltr"
          inputMode={negative ? "text" : "decimal"}
          placeholder="0"
          value={draft ?? showMoney(value, info.intl)}
          onFocus={(e) => { setDraft(showMoney(value, info.intl)); e.target.select(); }}
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
  const { t, usd } = useI18n();
  const span = Math.max(a.high - a.low, 1);
  const pos = (v: number) => `${((v - a.low) / span) * 100}%`;
  return (
    <div className="px-2 pb-6 pt-8" dir="ltr">
      <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg, var(--gold-a), var(--gold-b))", opacity: 0.55 }} />
      <div className="relative -mt-2 h-2">
        {a.rows.map((r) => (
          <span
            key={r.comp.id}
            title={t("range.dotTitle", { name: r.comp.address || t("common.comp"), price: usd(r.adjustedPrice) })}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{ left: pos(r.adjustedPrice), background: "var(--surface)", borderColor: "var(--brand)" }}
          />
        ))}
        <span className="absolute -top-7 -translate-x-1/2 text-center text-xs font-semibold uppercase" style={{ left: `clamp(16%, ${a.high > a.low ? pos(a.weighted) : "50%"}, 84%)`, color: "var(--accent)" }}>
          {t("range.weightedMarker")}
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

const STEP_KEYS = ["steps.subject", "steps.rates", "steps.comps", "steps.result"] as const;

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { t, rich, usd, date } = useI18n();
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<{ kind: "saving" | "saved" | "failed"; message?: string } | null>(null);
  const [missing, setMissing] = useState(false);
  const [removed, setRemoved] = useState<{ comp: Comp; index: number } | null>(null);
  type GeoStatus = { key: string; vars?: Vars; errorCode?: string; errorStatus?: number };
  const [geoStatus, setGeoStatus] = useState<GeoStatus | null>(null);
  const [locating, setLocating] = useState(false);
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
    setStatus({ kind: "saving" });
    const timer = setTimeout(() => {
      saveProject(project).then(() => setStatus({ kind: "saved" })).catch((e) => setStatus({ kind: "failed", message: String(e?.message ?? e) }));
    }, 600);
    return () => clearTimeout(timer);
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  const analysis = useMemo(() => (project ? analyze(project) : null), [project]);

  if (missing) {
    return (
      <div className="card space-y-3 p-8 text-center">
        <h1 className="text-xl font-semibold">{t("missing.title")}</h1>
        <p className="muted">{t("missing.body")}</p>
        <Link href="/" className="btn btn-primary">{t("missing.back")}</Link>
      </div>
    );
  }
  if (!project || !analysis) return <p className="muted">{t("common.loading")}</p>;

  const isBlank = isBlankProject(project);
  // In guided mode only the current step shows; printing always shows everything.
  const show = (n: number) => (!guided || step === n ? "" : "hidden print:block");
  const stepHint =
    step === 1 && !project.subject.sqft ? t("hint.sqft") :
    step === 3 && analysis.count === 0 ? t("hint.price") : "";
  const canNext = !stepHint;

  const set = (patch: Partial<Project>) => setProject({ ...project, ...patch });
  const setSubject = (patch: Partial<Subject>) => set({ subject: { ...project.subject, ...patch } });
  const setRates = (patch: Partial<Rates>) => set({ rates: { ...project.rates, ...patch } });
  async function locateAll() {
    const geocoderUrl = process.env.NEXT_PUBLIC_GEOCODER_URL || DEFAULT_GEOCODER_URL;
    type Target = { id: string | null; address: string };
    const todo: Target[] = [];
    if (project!.subject.address.trim() && !validGeo(project!.subject.geo, project!.subject.address)) todo.push({ id: null, address: project!.subject.address.trim() });
    for (const c of project!.comps) if (c.address.trim() && !validGeo(c.geo, c.address)) todo.push({ id: c.id, address: c.address.trim() });
    if (todo.length === 0) {
      setGeoStatus({ key: project!.subject.address.trim() || project!.comps.some((c) => c.address.trim()) ? "geo.allDone" : "geo.enterFirst" });
      return;
    }
    const host = new URL(geocoderUrl).host;
    if (!window.confirm(t("geo.confirm", { count: todo.length, host }))) return;

    setLocating(true);
    const failed: string[] = [];
    let found = 0;
    let stopped = "";
    let errorCode = "";
    let errorStatus = 0;
    for (let i = 0; i < todo.length; i++) {
      const target = todo[i];
      setGeoStatus({ key: "geo.progress", vars: { i: i + 1, total: todo.length } });
      const r = await geocodeAddress(target.address, { baseUrl: process.env.NEXT_PUBLIC_GEOCODER_URL });
      if (r.status === "ok") {
        found++;
        const point: GeoPoint = r.point;
        setProject((p) => p && (target.id === null ? { ...p, subject: { ...p.subject, geo: point } } : { ...p, comps: p.comps.map((c) => (c.id === target.id ? { ...c, geo: point } : c)) }));
      } else if (r.status === "not_found") {
        failed.push(target.address);
      } else {
        stopped = "x";
        errorCode = r.code;
        errorStatus = r.httpStatus ?? 0;
        break;
      }
      if (i < todo.length - 1) await new Promise((res) => setTimeout(res, GEOCODE_DELAY_MS));
    }
    // Fill in distances measured from the map, never overwriting one the preparer typed.
    setProject((p) => {
      if (!p) return p;
      const subj = validGeo(p.subject.geo, p.subject.address);
      if (!subj) return p;
      return {
        ...p,
        comps: p.comps.map((c) => {
          const g = validGeo(c.geo, c.address);
          if (!g || !(c.distanceMi === 0 || c.distanceComputed)) return c;
          return { ...c, distanceMi: Math.max(0.1, Math.round(haversineMiles(subj, g) * 10) / 10), distanceComputed: true };
        }),
      };
    });
    setLocating(false);
    setGeoStatus(
      stopped
        ? { key: "geo.stopped", vars: { found, total: todo.length }, errorCode, errorStatus }
        : failed.length
          ? { key: "geo.doneFailed", vars: { found, total: todo.length, list: failed.join("; ") } }
          : { key: "geo.doneMeasured", vars: { found, total: todo.length } },
    );
  }

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
      <header className="mb-2 hidden print:block">
        <div className="muted text-xs font-semibold uppercase tracking-widest">CompPilot</div>
        <h1 className="display text-3xl font-bold">{t("project.printTitle")}</h1>
        <p className="muted mt-1 text-sm">
          {[project.name, project.name.includes(project.subject.address) ? "" : project.subject.address, date(new Date())].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-3 h-px" style={{ background: "linear-gradient(90deg, var(--gold-b), transparent)" }} />
      </header>
      <Link href="/" className="muted tap no-print -ms-1 text-sm hover:underline">{t("app.allAnalyses")}</Link>
      <h1 className="sr-only"><bdi>{project.name || t("project.fallbackTitle")}</bdi></h1>
      {isBlank && (
        <div className="card no-print flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <span>{t("project.blankHint")}</span>
          <button className="btn" onClick={() => set(exampleData(t("name.example")))}>{t("project.loadExample")}</button>
        </div>
      )}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <input
          dir="auto" className="display w-full max-w-md bg-transparent text-3xl font-bold outline-none focus:underline"
          value={project.name}
          onChange={(e) => set({ name: e.target.value })}
          aria-label={t("project.nameLabel")}
        />
        <div className="flex flex-wrap items-center gap-3">
          <span className="muted text-sm">{status && (status.kind === "saving" ? t("project.saving") : status.kind === "saved" ? t("project.saved") : t("project.saveFailed", { message: status.message ?? "" }))}</span>
          <button onClick={() => { setGuided(!guided); setStep(1); }} className="btn">
            {guided ? t("project.showAll") : t("project.guideMe")}
          </button>
          <button onClick={locateAll} disabled={locating} className="btn" title={t("project.locateTitle")}>
            {locating ? t("project.locating") : t("project.locate")}
          </button>
          <Link href={`/project/${project.id}/report`} className="btn">{t("project.investorReport")}</Link>
          <button onClick={() => window.print()} className="btn">{t("common.print")}</button>
        </div>
      </div>

      {geoStatus && (
        <p className="no-print muted text-sm" role="status">
          {t(geoStatus.key, geoStatus.errorCode ? { ...geoStatus.vars, message: t(`geo.err.${geoStatus.errorCode}`, { status: geoStatus.errorStatus ?? 0 }) } : geoStatus.vars)}
        </p>
      )}

      {guided && (
        <nav className="no-print card flex items-center gap-1 p-2" aria-label={t("project.progress")}>
          {STEP_KEYS.map((k, i) => (
            <button
              key={k}
              onClick={() => setStep(i + 1)}
              aria-current={step === i + 1 ? "step" : undefined}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl px-1 py-2 text-sm font-semibold transition sm:gap-2 sm:px-2"
              style={step === i + 1 ? { background: "var(--brand)", color: "var(--brand-ink)" } : { color: step > i + 1 ? "var(--accent)" : "var(--muted)" }}
            >
              <span>{step > i + 1 ? "✓" : i + 1}</span>
              <span className="text-xs sm:text-sm">{t(k)}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className={`card p-5 ${show(1)}`}>
            <Step n={1} title={t("step1.title")} hint={t("step1.hint")} />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <label className="field col-span-2 md:col-span-4">{t("field.address")}
                <input className="input" dir="auto" placeholder={t("field.addressPlaceholder")} value={project.subject.address} onChange={(e) => setSubject({ address: e.target.value })} />
                {(() => { const g = validGeo(project.subject.geo, project.subject.address); return g ? <span className="mt-1 block text-xs font-normal" style={{ color: g.precise ? "var(--ok)" : "var(--warn)" }}>{t(g.precise ? "geo.matched" : "geo.matchedArea", { label: g.label })}</span> : null; })()}
              </label>
              <Num label={t("field.sqft")} value={project.subject.sqft} onChange={(n) => setSubject({ sqft: n })} />
              <Num label={t("field.beds")} value={project.subject.beds} onChange={(n) => setSubject({ beds: n })} />
              <Num label={t("field.baths")} step={0.5} value={project.subject.baths} onChange={(n) => setSubject({ baths: n })} />
              <Num label={t("field.yearBuilt")} value={project.subject.yearBuilt} onChange={(n) => setSubject({ yearBuilt: n })} />
            </div>
          </section>

          <section className={`card no-print p-5 ${show(2)}`}>
            <Step n={2} title={t("step2.title")} hint={t("step2.hint")} />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Money label={t("rate.sqft")} value={project.rates.perSqft} onChange={(n) => setRates({ perSqft: n })} />
              <Money label={t("rate.bed")} value={project.rates.perBed} onChange={(n) => setRates({ perBed: n })} />
              <Money label={t("rate.bath")} value={project.rates.perBath} onChange={(n) => setRates({ perBath: n })} />
              <Money label={t("rate.year")} value={project.rates.perYear} onChange={(n) => setRates({ perYear: n })} />
            </div>
            <label className="field mt-3 block">{t("ratesBasis.label")} <span className="font-normal">{t("ratesBasis.hint")}</span>
              <input className="input" dir="auto" placeholder={t("ratesBasis.placeholder")} value={project.ratesBasis ?? ""} onChange={(e) => set({ ratesBasis: e.target.value })} />
            </label>
          </section>

          {guided && step === 4 && (
            <section className="card no-print overflow-hidden">
              <h2 className="p-5 font-semibold">{t("glance.title")}</h2>
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {analysis.rows.map((r) => (
                  <li key={r.comp.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm" style={{ borderColor: "var(--border)" }}>
                    <span className="truncate"><bdi>{r.comp.address || t("common.unnamedComp")}</bdi></span>
                    <span className="muted whitespace-nowrap">{usd(r.comp.salePrice)} <span aria-hidden className="inline-block rtl:-scale-x-100">→</span> <strong style={{ color: "var(--ink)" }}>{usd(r.adjustedPrice)}</strong></span>
                  </li>
                ))}
              </ul>
              <p className="muted p-5 text-sm">{t("glance.note")}</p>
            </section>
          )}

          <section className={`space-y-3 ${show(3)}`}>
            <div className="flex items-center justify-between">
              <Step n={3} title={t("step3.title")} hint={t("step3.hint")} />
              <button className="btn btn-primary no-print" onClick={() => set({ comps: [...project.comps, newComp()] })}>{t("comp.add")}</button>
            </div>
            {removed && (
              <div className="card no-print flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span>{t("comp.removed")}</span>
                <button
                  className="font-semibold hover:underline"
                  style={{ color: "var(--brand)" }}
                  onClick={() => {
                    const next = [...project.comps];
                    next.splice(removed.index, 0, removed.comp);
                    set({ comps: next });
                    setRemoved(null);
                  }}
                >{t("common.undo")}</button>
              </div>
            )}
            {project.comps.length === 0 && (
              <div className="card muted p-8 text-center">{t("comp.noneYet")}</div>
            )}
            {project.comps.map((c, i) => {
              const row = analysis.rows.find((r) => r.comp.id === c.id);
              return (
                <div key={c.id} className="card p-5 transition" style={{ opacity: c.included ? 1 : 0.55 }}>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold">{t("comp.n", { n: i + 1 })}</span>
                    <div className="no-print flex items-center gap-4 text-sm">
                      <label className="tap flex items-center gap-2">
                        <input type="checkbox" className="h-5 w-5 accent-[var(--brand)]" checked={c.included} onChange={(e) => setComp(c.id, { included: e.target.checked })} /> {t("common.use")}
                      </label>
                      <button className="muted tap hover:underline" onClick={() => duplicateComp(c.id)}>{t("common.duplicate")}</button>
                      <button
                        className="muted tap hover:underline"
                        onClick={() => {
                          setRemoved({ comp: c, index: i });
                          set({ comps: project.comps.filter((x) => x.id !== c.id) });
                        }}
                      >{t("common.remove")}</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <label className="field col-span-2">{t("field.address")}
                      <input className="input" dir="auto" placeholder={t("field.addressPlaceholder")} value={c.address} onChange={(e) => setComp(c.id, { address: e.target.value })} />
                      {(() => { const g = validGeo(c.geo, c.address); return g ? <span className="mt-1 block text-xs font-normal" style={{ color: g.precise ? "var(--ok)" : "var(--warn)" }}>{t(g.precise ? "geo.matched" : "geo.matchedArea", { label: g.label })}</span> : null; })()}
                    </label>
                    <Money label={t("comp.salePrice")} value={c.salePrice} onChange={(n) => setComp(c.id, { salePrice: n })} />
                    <label className="field">{t("comp.saleDate")}
                      <input className="input" type="date" value={c.saleDate} onChange={(e) => setComp(c.id, { saleDate: e.target.value })} />
                    </label>
                    <Num label={t("field.sqft")} value={c.sqft} onChange={(n) => setComp(c.id, { sqft: n })} />
                    <Num label={t("field.beds")} value={c.beds} onChange={(n) => setComp(c.id, { beds: n })} />
                    <Num label={t("field.baths")} step={0.5} value={c.baths} onChange={(n) => setComp(c.id, { baths: n })} />
                    <Num label={t("field.yearBuilt")} value={c.yearBuilt} onChange={(n) => setComp(c.id, { yearBuilt: n })} />
                    <Num label={c.distanceComputed ? t("comp.distanceMap") : t("comp.distance")} step={0.1} value={c.distanceMi} onChange={(n) => setComp(c.id, { distanceMi: n, distanceComputed: false })} />
                    <Money label={t("comp.otherAdj")} negative value={c.otherAdj} onChange={(n) => setComp(c.id, { otherAdj: n })} />
                    <label className="field col-span-2">{t("comp.source")} <span className="font-normal">{t("comp.sourceHint")}</span>
                      <input className="input" dir="auto" placeholder={t("comp.sourcePlaceholder")} value={c.source ?? ""} onChange={(e) => setComp(c.id, { source: e.target.value })} />
                    </label>
                  </div>
                  {c.included && c.salePrice <= 0 && (
                    <p className="mt-4 text-sm" style={{ color: "var(--warn)" }}>{t("comp.needPrice")}</p>
                  )}
                  {row && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--surface-2)" }}>
                      <span className="muted">
                        {t("comp.netAdj")} <strong style={{ color: "var(--ink)" }}>{usd(row.netAdj)}</strong>
                        {row.grossAdjPct > 25 && (
                          <span className="ms-2" style={{ color: "var(--warn)" }} title={t("comp.heavyTitle")}>{t("comp.heavy")}</span>
                        )}
                      </span>
                      <span>{t("comp.adjustedPrice")} <strong className="text-lg">{usd(row.adjustedPrice)}</strong></span>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {guided && (
            <div className="no-print flex items-center justify-between gap-3">
              <button className="btn" disabled={step === 1} onClick={() => setStep(step - 1)} style={step === 1 ? { visibility: "hidden" } : undefined}>{t("common.back")}</button>
              <span className="text-sm" style={{ color: "var(--warn)" }}>{step < 4 ? stepHint : ""}</span>
              {step < 4 ? (
                <button className="btn btn-primary" disabled={!canNext} style={!canNext ? { opacity: 0.5, cursor: "not-allowed" } : undefined} onClick={() => setStep(step + 1)}>
                  {step === 3 ? t("common.seeResult") : t("common.next")}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => window.print()}>{t("common.print")}</button>
              )}
            </div>
          )}
        </div>

        <aside className={`print:order-first lg:sticky lg:top-20 lg:self-start ${guided ? (step === 4 ? "order-first lg:order-none" : "hidden lg:block print:block") : ""}`}>
          <div className="card overflow-hidden">
            <div className="p-5" style={{ background: "linear-gradient(135deg, var(--panel-a), var(--panel-b))", color: "var(--panel-ink)", borderBottom: "1px solid color-mix(in srgb, var(--gold-b) 60%, transparent)" }}>
              <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{t("result.weighted")}</div>
              <div className="display gold-text mt-1 text-4xl font-bold">{analysis.count ? usd(analysis.weighted) : "—"}</div>
              <div className="mt-1 text-sm opacity-80">{t("result.compsUsed", { used: analysis.count, count: project.comps.length })}</div>
            </div>
            {analysis.count === 0 ? (
              <p className="muted p-5 text-sm">{t("result.needOne")}</p>
            ) : (
              <>
                <RangeBar a={analysis} />
                <dl className="grid grid-cols-3 gap-2 px-5 pb-5 text-center">
                  {([["result.low", analysis.low], ["result.median", analysis.median], ["result.high", analysis.high]] as const).map(([l, v]) => (
                    <div key={l} className="min-w-0 rounded-xl p-2" style={{ background: "var(--surface-2)" }}>
                      <dt className="muted text-xs font-semibold uppercase">{t(l)}</dt>
                      <dd className="whitespace-nowrap text-[13px] font-bold sm:text-sm" dir="ltr">{usd(v)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            <p className="muted border-t px-5 py-3 text-xs leading-5" style={{ borderColor: "var(--border)" }}>
              {rich("result.how", {}, { b: (x, i) => <strong key={i}>{x}</strong> })}
            </p>
            <p className="muted border-t p-4 text-xs leading-5" style={{ borderColor: "var(--border)" }}>
              {t("result.disclaimer")}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
