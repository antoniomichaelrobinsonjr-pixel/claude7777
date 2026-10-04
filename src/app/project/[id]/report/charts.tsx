"use client";
import { useEffect, useRef, useState } from "react";
import type { CompEvidence, Trend } from "@/lib/report";
import { useI18n } from "@/i18n";
import { n } from "@/i18n/format";

const ML = 58, MR = 18, MT = 18, MB = 40;

/** Track the container width so the SVG is drawn at real pixel size and text never shrinks on small screens. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.max(280, Math.round(e[0].contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const niceStep = (range: number, ticks: number) => {
  const raw = range / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
};
/** Sale price per sq ft against sale date. One series, so no legend; the title names it. */
export function TrendChart({ trend, land = false }: { trend: Trend; land?: boolean }) {
  const { t, tm, rich, usd, num, date, info } = useI18n();
  const dateLabel = (ts: number) => date(ts, { month: "short", year: "2-digit" });
  const dateFull = (ts: number) => date(ts, { year: "numeric", month: "short", day: "numeric" });
  const [hover, setHover] = useState<string | null>(null);
  const [boxRef, W] = useWidth();
  const H = W < 480 ? 260 : 300;
  const pts = trend.points;
  if (pts.length === 0) return <p className="muted text-sm">{t("chart.noData")}</p>;

  const minTs = pts[0].ts, maxTs = pts[pts.length - 1].ts;
  const padX = maxTs === minTs ? 15 * 86_400_000 : (maxTs - minTs) * 0.08;
  const x0 = minTs - padX, x1 = maxTs + padX;
  const ys = pts.map((p) => p.ppsf);
  const rawLo = Math.min(...ys), rawHi = Math.max(...ys);
  const padY = Math.max((rawHi - rawLo) * 0.25, rawHi * 0.03);
  const step = niceStep(rawHi - rawLo + 2 * padY, 4);
  const yLo = Math.floor((rawLo - padY) / step) * step;
  const yHi = Math.ceil((rawHi + padY) / step) * step;
  const sx = (ts: number) => ML + ((ts - x0) / (x1 - x0)) * (W - ML - MR);
  const sy = (v: number) => MT + (1 - (v - yLo) / (yHi - yLo)) * (H - MT - MB);
  const yTicks: number[] = [];
  for (let v = yLo; v <= yHi + 1e-9; v += step) yTicks.push(v);
  const xTicks = [x0 + (x1 - x0) * 0.1, (x0 + x1) / 2, x1 - (x1 - x0) * 0.1];
  const hovered = pts.find((p) => p.id === hover) ?? null;

  const hasLine = trend.slopePerMs !== null && trend.intercept !== null;
  const line = hasLine ? { y0: trend.intercept! + trend.slopePerMs! * 0, y1: trend.intercept! + trend.slopePerMs! * (maxTs - minTs) } : null;

  return (
    <div>
      <div className="relative" ref={boxRef} dir="ltr">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label={t("chart.aria")}>
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={ML} x2={W - MR} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeWidth="1" />
              <text x={ML - 8} y={sy(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">{usd(v)}</text>
            </g>
          ))}
          <line x1={ML} x2={W - MR} y1={H - MB} y2={H - MB} stroke="var(--border)" strokeWidth="1" />
          {xTicks.map((t) => (
            <text key={t} x={sx(t)} y={H - MB + 20} textAnchor="middle" fontSize="12" fill="var(--muted)">{dateLabel(t)}</text>
          ))}
          {line && (
            <line x1={sx(minTs)} y1={sy(line.y0)} x2={sx(maxTs)} y2={sy(line.y1)} stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" />
          )}
          {pts.map((p) => (
            <g key={p.id}>
              <circle cx={sx(p.ts)} cy={sy(p.ppsf)} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
              <circle
                cx={sx(p.ts)} cy={sy(p.ppsf)} r="24" fill="transparent" tabIndex={0} role="img"
                aria-label={t("chart.pointAria", { address: p.address || t("common.unnamedComp"), price: usd(p.ppsf), date: dateFull(p.ts) })}
                onPointerEnter={() => setHover(p.id)} onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(p.id)} onBlur={() => setHover(null)}
                style={{ outline: "none", cursor: "pointer" }}
              />
              {hover === p.id && <circle cx={sx(p.ts)} cy={sy(p.ppsf)} r="9" fill="none" stroke="var(--accent)" strokeWidth="1.5" />}
            </g>
          ))}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border px-3 py-2 text-xs shadow-lg"
            style={{ left: `${(sx(hovered.ts) / W) * 100}%`, top: `${(sy(hovered.ppsf) / H) * 100 - 3}%`, background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div dir={info.dir}>
              <div className="text-base font-bold">{t(land ? "land.chart.perSqft" : "chart.perSqft", { price: usd(hovered.ppsf) })}</div>
              <div className="muted"><bdi>{hovered.address || t("common.unnamedComp")}</bdi></div>
              <div className="muted">{t("chart.sold", { date: dateFull(hovered.ts) })}</div>
            </div>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm">
        {trend.slopePctPerMonth === null ? (
          tm(trend.note)
        ) : (
          <>
            {rich(
              `${land ? "land." : ""}${Math.abs(trend.slopePctPerMonth) < 0.1 ? "trend.flat" : trend.slopePctPerMonth > 0 ? "trend.rising" : "trend.falling"}`,
              { pct: num(n.dec1(Math.abs(trend.slopePctPerMonth))) },
              { b: (x, i) => <strong key={i}>{x}</strong> },
            )}{" "}
            <span className="muted">{tm(trend.note)}</span>
          </>
        )}
      </p>
      <details className="mt-2 text-sm">
        <summary className="muted tap cursor-pointer">{t("common.viewTable")}</summary>
        <table className="mt-2 w-full text-start">
          <thead className="muted text-xs uppercase"><tr><th className="py-1 pe-3 text-start">{t("col.property")}</th><th className="pe-3 text-start">{t("col.sold")}</th><th className="text-end">{t(land ? "land.col.perSqft" : "col.perSqft")}</th></tr></thead>
          <tbody>
            {pts.map((p) => (
              <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1 pe-3"><bdi>{p.address || t("common.unnamedComp")}</bdi></td><td className="pe-3">{dateFull(p.ts)}</td><td className="text-end">{usd(p.ppsf)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

/** How far each comp is from the subject. Distance only: no direction is known, so this is not a map. */
export function DistanceBars({ comps }: { comps: CompEvidence[] }) {
  const { t, num } = useI18n();
  const mi = (v: number, dp: "dec1" | "dec2" = "dec1") => t("common.unit.mi", { value: num(n[dp](v)) });
  const withDist = comps.filter((c) => c.distanceMi !== null).sort((a, b) => a.distanceMi! - b.distanceMi!);
  const missing = comps.length - withDist.length;
  if (withDist.length === 0) return <p className="muted text-sm">{t("distance.none")}</p>;
  const max = Math.max(1, Math.ceil(Math.max(...withDist.map((c) => c.distanceMi!)) * 2) / 2);
  // Leave room at the right for the label after the longest bar, whatever the language.
  const pos = (mi: number) => `${(mi / max) * 84}%`;

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-x-3 gap-y-2 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
        {withDist.map((c) => (
          <div key={c.id} className="contents">
            <div className="truncate" title={c.address}><bdi>{c.address || t("common.unnamedComp")}</bdi></div>
            <div className="relative h-6" tabIndex={0} role="img" title={t("distance.barAria", { address: c.address || t("common.unnamedComp"), miles: num(n.dec1(c.distanceMi!)) })} aria-label={t("distance.barAria", { address: c.address || t("common.unnamedComp"), miles: num(n.dec1(c.distanceMi!)) })}>
              <div
                className="absolute start-0 top-1 h-4 transition hover:brightness-110"
                style={{ width: pos(c.distanceMi!), minWidth: 4, background: "var(--accent)", borderStartEndRadius: 4, borderEndEndRadius: 4 }}
              />
              <span className="absolute top-0.5 text-xs font-semibold" style={{ insetInlineStart: `calc(${pos(c.distanceMi!)} + 8px)` }}>{mi(c.distanceMi!)}</span>
            </div>
          </div>
        ))}
        <div />
        <div className="muted relative h-4 text-xs" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="absolute start-0 top-1">{t("distance.subject")}</span>
          {max > 1 && <span className="absolute top-1 -translate-x-1/2 rtl:translate-x-1/2" style={{ insetInlineStart: pos(1) }}>{mi(1)}</span>}
          <span className="absolute end-0 top-1">{mi(max)}</span>
        </div>
      </div>
      <p className="muted mt-2 text-xs">
        {t("distance.note")}{missing > 0 ? ` ${t("distance.hidden", { count: missing })}` : ""}
      </p>
      <details className="mt-2 text-sm">
        <summary className="muted tap cursor-pointer">{t("common.viewTable")}</summary>
        <table className="mt-2 w-full text-start">
          <thead className="muted text-xs uppercase"><tr><th className="py-1 pe-3 text-start">{t("col.property")}</th><th className="text-end">{t("col.miles")}</th></tr></thead>
          <tbody>
            {withDist.map((c) => (
              <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}><td className="py-1 pe-3"><bdi>{c.address || t("common.unnamedComp")}</bdi></td><td className="text-end">{num(n.dec1(c.distanceMi!))}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

