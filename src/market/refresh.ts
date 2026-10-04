import { BIS_SOURCE, parseBisCsv } from "./bis.ts";
import { latestPoint, type IndexPoint } from "./series.ts";

export interface MarketStore {
  /** One row per country; replaces that country's whole series. */
  saveCountry(code: string, series: IndexPoint[], fetchedAt: string): Promise<void>;
  saveMeta(meta: { fetchedAt: string; source: string; countries: number; latestPeriod: string | null }): Promise<void>;
}

export interface RefreshDeps {
  fetchText(url: string): Promise<string>;
  store: MarketStore;
  url: string;
  now?: () => Date;
}

export interface RefreshResult { countries: number; skippedCountries: string[]; latestPeriod: string | null; skippedRows: number }

/** A country needs at least this many quarters to be useful for "last year" and "since the sale" comparisons. */
export const MIN_QUARTERS = 8;
/** If fewer countries than this come back, the response is treated as broken and nothing is saved. */
export const MIN_COUNTRIES = 20;

/**
 * Download, check, then save. Nothing is written unless the whole download looks sane, and a country's old series is only
 * ever replaced by a new one, never deleted, so a bad day at the source leaves yesterday's data in place.
 */
export async function refreshMarket(d: RefreshDeps): Promise<RefreshResult> {
  const parsed = parseBisCsv(await d.fetchText(d.url));
  const usable: [string, IndexPoint[]][] = [];
  const skippedCountries: string[] = [];
  for (const [code, s] of Object.entries(parsed.series)) {
    if (s.length >= MIN_QUARTERS) usable.push([code, s]);
    else skippedCountries.push(code);
  }
  if (usable.length < MIN_COUNTRIES) throw new Error("too_few_countries");

  const fetchedAt = (d.now?.() ?? new Date()).toISOString();
  let latest: string | null = null;
  for (const [code, s] of usable) {
    await d.store.saveCountry(code, s, fetchedAt);
    const last = latestPoint(s)!.period;
    if (!latest || last > latest) latest = last;
  }
  await d.store.saveMeta({ fetchedAt, source: BIS_SOURCE, countries: usable.length, latestPeriod: latest });
  return { countries: usable.length, skippedCountries, latestPeriod: latest, skippedRows: parsed.skippedRows };
}
