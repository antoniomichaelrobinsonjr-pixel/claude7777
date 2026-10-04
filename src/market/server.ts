import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BIS_SOURCE, BIS_URL } from "./bis";
import type { MarketStore } from "./refresh";
import { cleanSeries, type IndexPoint } from "./series";

export const bisUrl = () => process.env.MARKET_BIS_URL?.trim() || BIS_URL;

/** Download text with a timeout and a size cap, so a slow or huge response can't hang or exhaust the function. */
export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Accept: "text/csv" }, signal: AbortSignal.timeout(45_000), cache: "no-store" });
  if (!res.ok) throw new Error(`source_http_${res.status}`);
  const text = await res.text();
  if (text.length > 50_000_000) throw new Error("response_too_large");
  return text;
}

export const marketStore = (admin: SupabaseClient): MarketStore => ({
  async saveCountry(code, series, fetchedAt) {
    const { error } = await admin.from("market_series").upsert({ country: code, series, latest_period: series[series.length - 1]?.period ?? null, fetched_at: fetchedAt });
    if (error) throw new Error(`save_failed:${error.message}`);
  },
  async saveMeta(m) {
    const { error } = await admin.from("market_meta").upsert({ id: 1, fetched_at: m.fetchedAt, source: m.source, countries: m.countries, latest_period: m.latestPeriod });
    if (error) throw new Error(`save_failed:${error.message}`);
  },
});

export const marketReader = (admin: SupabaseClient) => ({
  async load(country: string): Promise<{ series: IndexPoint[]; fetchedAt: string; source: string } | null> {
    const { data } = await admin.from("market_series").select("series, fetched_at").eq("country", country).maybeSingle();
    if (!data) return null;
    return { series: cleanSeries(Array.isArray(data.series) ? (data.series as IndexPoint[]) : []), fetchedAt: data.fetched_at as string, source: BIS_SOURCE };
  },
  async meta(): Promise<{ fetchedAt: string; source: string } | null> {
    const { data } = await admin.from("market_meta").select("fetched_at, source").eq("id", 1).maybeSingle();
    return data ? { fetchedAt: data.fetched_at as string, source: data.source as string } : null;
  },
});
