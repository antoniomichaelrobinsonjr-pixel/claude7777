"use client";
import { useEffect, useRef, useState } from "react";
import type { CompEvidence, Trend } from "@/lib/report";

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
const dateLabel = (ts: number) => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
const dateFull = (ts: number) => new Date(ts).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

/** Sale price per sq ft against sale date. One series, so no legend; the title names it. */
export function TrendChart({ trend }: { trend: Trend }) {
  const [hover, setHover] = useState<string | null>(null);
  const [boxRef, W] = useWidth();
  const H = W < 480 ? 260 : 300;
  const pts = trend.points;
  if (pts.length === 0) return <p className="muted text-sm">No comps have both a sale date and a size, so there is nothing to plot.</p>;

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
      <div className="relative" ref={boxRef}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="img" aria-label="Sale price per square foot by sale date">
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={ML} x2={W - MR} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeWidth="1" />
              <text x={ML - 8} y={sy(v) + 4} textAnchor="end" fontSize="12" fill="var(--muted)">${Math.round(v).toLocaleString("en-US")}</text>
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
                aria-label={`${p.address}: $${p.ppsf.toFixed(0)} per square foot, sold ${dateFull(p.ts)}`}
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
            <div className="text-base font-bold">${hovered.ppsf.toFixed(0)}<span className="muted text-xs font-normal"> per sq ft</span></div>
            <div className="muted">{hovered.address}</div>
            <div className="muted">Sold {dateFull(hovered.ts)}</div>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm">
        {trend.slopePctPerMonth === null ? (
          trend.note
        ) : (
          <>
            Sale price per sq ft is{" "}
            <strong>
              {Math.abs(trend.slopePctPerMonth) < 0.1 ? "roughly flat" : `${trend.slopePctPerMonth > 0 ? "rising" : "falling"} about ${Math.abs(trend.slopePctPerMonth).toFixed(1)}% per month`}
            </strong>{" "}
            across these sales. <span className="muted">{trend.note}</span>
          </>
        )}
      </p>
      <details className="mt-2 text-sm">
        <summary className="muted tap cursor-pointer">View as table</summary>
        <table className="mt-2 w-full text-left">
          <thead className="muted text-xs uppercase"><tr><th className="py-1 pr-3">Property</th><th className="pr-3">Sold</th><th className="text-right">$ per sq ft</th></tr></thead>
          <tbody>
            {pts.map((p) => (
              <tr key={p.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1 pr-3">{p.address}</td><td className="pr-3">{dateFull(p.ts)}</td><td className="text-right">${p.ppsf.toFixed(0)}</td>
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
  const withDist = comps.filter((c) => c.distanceMi !== null).sort((a, b) => a.distanceMi! - b.distanceMi!);
  const missing = comps.length - withDist.length;
  if (withDist.length === 0) return <p className="muted text-sm">No distances have been entered for these comps.</p>;
  const max = Math.max(1, Math.ceil(Math.max(...withDist.map((c) => c.distanceMi!)) * 2) / 2);
  const pos = (mi: number) => `${(mi / max) * 100}%`;

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-x-3 gap-y-2 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]">
        {withDist.map((c) => (
          <div key={c.id} className="contents">
            <div className="truncate" title={c.address}>{c.address}</div>
            <div className="relative h-6" tabIndex={0} role="img" title={`${c.address}: ${c.distanceMi!.toFixed(1)} miles from the subject`} aria-label={`${c.address}: ${c.distanceMi!.toFixed(1)} miles from the subject`}>
              <div
                className="absolute left-0 top-1 h-4 transition hover:brightness-110"
                style={{ width: pos(c.distanceMi!), minWidth: 4, background: "var(--accent)", borderRadius: "0 4px 4px 0" }}
              />
              <span className="absolute top-0.5 text-xs font-semibold" style={{ left: `calc(${pos(c.distanceMi!)} + 8px)` }}>{c.distanceMi!.toFixed(1)} mi</span>
            </div>
          </div>
        ))}
        <div />
        <div className="muted relative h-4 text-xs" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="absolute left-0 top-1">Subject</span>
          {max > 1 && <span className="absolute top-1 -translate-x-1/2" style={{ left: pos(1) }}>1 mi</span>}
          <span className="absolute right-0 top-1">{max} mi</span>
        </div>
      </div>
      <p className="muted mt-2 text-xs">
        Distance only. Direction from the subject is not known, so this is not a map.{missing > 0 ? ` ${missing} comp${missing === 1 ? "" : "s"} with no distance entered ${missing === 1 ? "is" : "are"} not shown.` : ""}
      </p>
      <details className="mt-2 text-sm">
        <summary className="muted tap cursor-pointer">View as table</summary>
        <table className="mt-2 w-full text-left">
          <thead className="muted text-xs uppercase"><tr><th className="py-1 pr-3">Property</th><th className="text-right">Miles</th></tr></thead>
          <tbody>
            {withDist.map((c) => (
              <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)" }}><td className="py-1 pr-3">{c.address}</td><td className="text-right">{c.distanceMi!.toFixed(1)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

