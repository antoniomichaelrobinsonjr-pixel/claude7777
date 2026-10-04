/**
 * Country-level residential price index, one value per quarter. Everything here is pure so the browser, the server and
 * the tests share it.
 */
export interface IndexPoint { period: string; value: number }

const PERIOD = /^(\d{4})-Q([1-4])$/;

/** "2024-Q3" for a date like "2024-08-15"; null when the date isn't usable. */
export function periodOf(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-Q${Math.ceil(month / 3)}`;
}

export const isPeriod = (p: string) => PERIOD.test(p);

/** Position of a quarter on one axis, so "4 quarters earlier" is a subtraction. */
export function periodNumber(p: string): number {
  const m = PERIOD.exec(p);
  if (!m) return NaN;
  return Number(m[1]) * 4 + (Number(m[2]) - 1);
}

export function periodFromNumber(n: number): string {
  return `${Math.floor(n / 4)}-Q${(n % 4) + 1}`;
}

/** Oldest first, one point per quarter, bad values dropped. */
export function cleanSeries(points: IndexPoint[]): IndexPoint[] {
  const byPeriod = new Map<string, number>();
  for (const p of points) if (isPeriod(p.period) && Number.isFinite(p.value) && p.value > 0) byPeriod.set(p.period, p.value);
  return [...byPeriod].map(([period, value]) => ({ period, value })).sort((a, b) => periodNumber(a.period) - periodNumber(b.period));
}

export const latestPoint = (s: IndexPoint[]): IndexPoint | null => (s.length ? s[s.length - 1] : null);

const valueAt = (s: IndexPoint[], period: string) => s.find((p) => p.period === period)?.value ?? null;

/** Percent change over the last four quarters, or null when the series doesn't reach back that far. */
export function yearOnYear(s: IndexPoint[]): number | null {
  const last = latestPoint(s);
  if (!last) return null;
  const before = valueAt(s, periodFromNumber(periodNumber(last.period) - 4));
  return before === null ? null : (last.value / before - 1) * 100;
}

/**
 * How far the market has moved since a sale, as a percent: the latest index over the index in the quarter of the sale.
 * Null when it can't be measured (no date, before the series starts, or the sale is in the quarter not yet published).
 */
export function driftSince(s: IndexPoint[], saleDate: string): number | null {
  const last = latestPoint(s);
  const p = periodOf(saleDate);
  if (!last || !p) return null;
  if (periodNumber(p) > periodNumber(last.period)) return null;
  const then = valueAt(s, p);
  return then === null ? null : (last.value / then - 1) * 100;
}
