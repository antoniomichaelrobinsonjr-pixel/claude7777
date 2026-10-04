"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { n } from "@/i18n/format";
import type { PropertyKind } from "@/lib/comps";
import { parseComps, type FieldName, type ParsedComp } from "./parse";
import { dateOrderFor, recognitionCtor, recognitionLang, speechProblem, type RecognitionLike, type SpeechProblem } from "./speech";

const REQUIRED: FieldName[] = ["salePrice", "sqft"];

/**
 * Add comps by speaking or typing. The same box does both: the microphone writes what it hears into the box, and "Read it"
 * turns whatever is in the box into comps for checking. Nothing is added until the person confirms.
 */
export function VoiceEntry({ kind, defaultOpen, onApply }: {
  kind: PropertyKind;
  defaultOpen: boolean;
  /** Add the comps; says how many went in and how many didn't fit the plan. */
  onApply: (parsed: ParsedComp[]) => { added: number; skipped: number };
}) {
  const { t, usd, num, date, info } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<SpeechProblem | null>(null);
  const [parsed, setParsed] = useState<ParsedComp[] | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const [supported, setSupported] = useState(false);
  const consented = useRef(false);
  const rec = useRef<RecognitionLike | null>(null);

  useEffect(() => { setSupported(recognitionCtor() !== null); return () => { rec.current?.abort(); }; }, []);

  function start() {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if (!consented.current) {
      // Browsers send the audio to their speech service; say so before the first time.
      if (!window.confirm(t("voice.consent"))) return;
      consented.current = true;
    }
    const r = new Ctor();
    r.lang = recognitionLang(info.intl);
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let finals = "", partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finals += res[0].transcript; else partial += res[0].transcript;
      }
      if (finals.trim()) setText((prev) => (prev.trim() ? `${prev.trimEnd()} ` : "") + finals.trim());
      setInterim(partial);
    };
    // an error ends listening, whether or not the browser also reports the end
    r.onerror = (e) => { const p = speechProblem(e.error); if (p) { setProblem(p); setListening(false); setInterim(""); } };
    r.onend = () => { setListening(false); setInterim(""); rec.current = null; };
    setProblem(null);
    setResult(null);
    rec.current = r;
    try { r.start(); setListening(true); } catch { setProblem("generic"); rec.current = null; }
  }
  const stop = () => rec.current?.stop();

  function read() {
    if (listening) stop();
    setResult(null);
    setParsed(parseComps(text, { kind, dateOrder: dateOrderFor(info.intl) }));
  }
  function add() {
    if (!parsed?.length) return;
    setResult(onApply(parsed));
    setParsed(null);
    setText("");
  }

  const label = (f: FieldName): string => ({
    address: t("field.address"), salePrice: t("comp.salePrice"), saleDate: t("comp.saleDate"),
    sqft: t(kind === "land" ? "land.field.sqft" : kind === "estate" ? "estate.field.sqft" : "field.sqft"),
    acres: t("field.lotAcres"), beds: t("field.beds"), baths: t("field.baths"), yearBuilt: t("field.yearBuilt"),
    floor: t("field.floor"), parking: t("field.parking"), monthlyFee: t("field.monthlyFee"), distanceMi: t("comp.distance"), source: t("comp.source"),
  } as Record<FieldName, string>)[f];
  const plain = (v: number) => (Number.isInteger(v) ? num(n.int(v)) : num(n.dec2(v)));
  const show = (f: FieldName, v: unknown): string => {
    if (typeof v === "string") return f === "saleDate" ? date(new Date(`${v}T00:00:00`), { year: "numeric", month: "short", day: "numeric" }) : v;
    if (typeof v !== "number") return "";
    if (f === "salePrice" || f === "monthlyFee") return usd(v);
    if (f === "yearBuilt") return String(v);
    return plain(v);
  };
  const errorText = problem && t(`voice.err.${problem}`);
  const status = listening ? t("voice.listening") : errorText ?? "";
  const english = /^en(-|$)/i.test(info.intl);

  return (
    <details className="card no-print p-5" open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer font-semibold">{t("voice.title")}</summary>
      <div className="mt-3 space-y-3">
        <p className="muted text-sm">{t("voice.intro")}</p>
        {!english && <p className="muted text-sm">{t("voice.englishOnly")}</p>}
        <label className="field">{t("voice.label")}
          <textarea
            className="input min-h-24" dir="auto" rows={3} value={text} placeholder={t("voice.placeholder")}
            onChange={(e) => { setText(e.target.value); setParsed(null); setResult(null); }}
          />
        </label>
        {interim && <p className="muted text-sm" aria-hidden dir="auto">{interim}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {supported && (
            <button type="button" className={`btn ${listening ? "btn-primary" : ""}`} aria-pressed={listening} onClick={listening ? stop : start}>
              <span aria-hidden>{listening ? "■ " : "🎤 "}</span>{listening ? t("voice.stop") : t("voice.speak")}
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={read}>{t("voice.read")}</button>
          <button type="button" className="btn" disabled={!text && !parsed} onClick={() => { setText(""); setParsed(null); setResult(null); }}>{t("voice.clear")}</button>
        </div>
        <p className="min-h-5 text-sm" role="status" style={problem ? { color: "var(--warn)" } : undefined}>{status}</p>
        {!supported && <p className="muted text-sm">{t("voice.unsupported")}</p>}

        {parsed && parsed.length === 0 && <p className="text-sm" role="status" style={{ color: "var(--warn)" }}>{t("voice.nothing")}</p>}
        {parsed && parsed.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-semibold">{t("voice.preview")}</h3>
            <ol className="space-y-2">
              {parsed.map((p, i) => {
                const missing = REQUIRED.filter((f) => !p.found.includes(f));
                return (
                  <li key={i} className="rounded-xl p-3 text-sm" style={{ background: "var(--surface-2)" }}>
                    <div className="font-semibold">{t("comp.n", { n: i + 1 })}</div>
                    <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {p.found.map((f) => (
                        <div key={f} className="flex gap-1"><dt className="muted">{label(f)}:</dt><dd className="font-medium" dir="auto">{show(f, p.fields[f as keyof typeof p.fields])}</dd></div>
                      ))}
                    </dl>
                    {missing.length > 0 && <p className="mt-1" style={{ color: "var(--warn)" }}>{t("voice.needs", { fields: missing.map(label).join(", ") })}</p>}
                    {p.ignored.length > 0 && <p className="muted mt-1">{t("voice.ignored", { fields: p.ignored.map(label).join(", ") })}</p>}
                  </li>
                );
              })}
            </ol>
            <button type="button" className="btn btn-primary" onClick={add}>{t("voice.add", { count: parsed.length })}</button>
          </div>
        )}
        {result && (
          <div className="text-sm" role="status">
            {result.added > 0 ? <p style={{ color: "var(--ok)" }}>{t("voice.added", { count: result.added })}</p> : <p style={{ color: "var(--warn)" }}>{t("voice.limit.none")}</p>}
            {result.skipped > 0 && result.added > 0 && <p style={{ color: "var(--warn)" }}>{t("voice.skipped", { count: result.skipped })}</p>}
          </div>
        )}
      </div>
    </details>
  );
}
