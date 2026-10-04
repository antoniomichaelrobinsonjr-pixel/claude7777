"use client";
import { useI18n } from "@/i18n";
import type { PathPoint, ProjectionRow } from "@/lib/audience";

const W = 640, H = 260, PAD = { l: 64, r: 16, t: 14, b: 28 };
const YEAR_MS = 365.25 * 86_400_000;

/**
 * Value over time: the past carried back with the market (solid gold), then three yearly-growth scenarios from today
 * (dashed low and high, solid middle). Line styles, not colour alone, tell the series apart, and a table follows.
 */
export function ValueChart({ history, rows, todayTs }: { history: PathPoint[]; rows: ProjectionRow[]; todayTs: number }) {
  const { t, usd, date } = useI18n();
  const start = history.length ? history[0].ts : todayTs;
  const end = todayTs + (rows.length - 1) * YEAR_MS;
  const all = [...history.map((p) => p.value), ...rows.flatMap((r) => r.values)];
  const lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo || hi) * 0.08;
  const yMin = Math.max(0, lo - pad), yMax = hi + pad;
  const sx = (ts: number) => PAD.l + ((ts - start) / (end - start || 1)) * (W - PAD.l - PAD.r);
  const sy = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);
  const line = (pts: [number, number][]) => pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const histLine = line(history.map((p) => [sx(p.ts), sy(p.value)]));
  const proj = (i: 0 | 1 | 2) => line(rows.map((r) => [sx(todayTs + r.year * YEAR_MS), sy(r.values[i])]));
  const yr = (ts: number) => date(new Date(ts), { year: "numeric" });
  const last = rows[rows.length - 1];
  const aria = t("owner.chart.aria", { from: yr(start), to: yr(end), low: usd(last.values[0]), mid: usd(last.values[1]), high: usd(last.values[2]) });
  const SERIES: { key: string; dash?: string; width: number; color: string; label: string }[] = [
    ...(history.length ? [{ key: "past", width: 2.5, color: "var(--accent)", label: t("owner.legend.past") }] : []),
    { key: "low", dash: "6 5", width: 2, color: "var(--ink)", label: t("owner.scn.low") },
    { key: "mid", width: 2.5, color: "var(--ink)", label: t("owner.scn.mid") },
    { key: "high", dash: "2 4", width: 2.5, color: "var(--ink)", label: t("owner.scn.high") },
  ];

  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs" aria-label={t("owner.legend.aria")}>
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <svg width="28" height="8" aria-hidden><line x1="0" y1="4" x2="28" y2="4" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="round" /></svg>
            {s.label}
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} className="w-full" style={{ maxHeight: 320 }}>
        {[0, 0.5, 1].map((f) => {
          const v = yMin + (yMax - yMin) * f;
          return (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} stroke="var(--border)" strokeWidth="1" />
              <text x={PAD.l - 8} y={sy(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{usd(v)}</text>
            </g>
          );
        })}
        <line x1={sx(todayTs)} x2={sx(todayTs)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted)" strokeWidth="1" strokeDasharray="2 3" />
        <text x={sx(todayTs)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{t("owner.today")}</text>
        <text x={PAD.l} y={H - 8} textAnchor="start" fontSize="11" fill="var(--muted)">{yr(start)}</text>
        <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize="11" fill="var(--muted)">{yr(end)}</text>
        {history.length > 1 && <polyline points={histLine} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {history.map((p) => <circle key={p.ts} cx={sx(p.ts)} cy={sy(p.value)} r={p.kind === "anniversary" ? 3 : 4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5" />)}
        <polyline points={proj(0)} fill="none" stroke="var(--ink)" strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round" />
        <polyline points={proj(2)} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeDasharray="2 4" strokeLinecap="round" />
        <polyline points={proj(1)} fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <details className="mt-2 text-sm">
        <summary className="muted tap cursor-pointer">{t("common.viewTable")}</summary>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t("owner.chart.tableAria")}>
          <table className="mt-2 w-full text-start">
            <thead className="muted text-xs uppercase"><tr><th className="py-1 pe-3 text-start">{t("owner.col.when")}</th><th className="pe-3 text-end">{t("owner.legend.past")}</th><th className="pe-3 text-end">{t("owner.scn.low")}</th><th className="pe-3 text-end">{t("owner.scn.mid")}</th><th className="text-end">{t("owner.scn.high")}</th></tr></thead>
            <tbody>
              {history.map((p) => (
                <tr key={`h${p.ts}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="whitespace-nowrap py-1 pe-3">{date(new Date(p.ts), { year: "numeric", month: "short" })}</td>
                  <td className="whitespace-nowrap pe-3 text-end" dir="ltr">{usd(p.value)}</td><td className="pe-3 text-end">—</td><td className="pe-3 text-end">—</td><td className="text-end">—</td>
                </tr>
              ))}
              {rows.map((r) => (
                <tr key={`p${r.year}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="whitespace-nowrap py-1 pe-3">{date(new Date(todayTs + r.year * YEAR_MS), { year: "numeric" })}</td>
                  <td className="pe-3 text-end">—</td>
                  {r.values.map((v, i) => <td key={i} className={`whitespace-nowrap text-end ${i < 2 ? "pe-3" : ""}`} dir="ltr">{usd(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
