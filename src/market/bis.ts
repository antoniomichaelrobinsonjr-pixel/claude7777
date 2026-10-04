import { cleanSeries, isPeriod, type IndexPoint } from "./series.ts";

/**
 * The Bank for International Settlements publishes residential property price indices for around sixty countries
 * (dataset WS_SPP). We use the nominal index (value "N", unit 628: index, 2010 = 100), because comps are nominal prices.
 * The URL can be overridden with MARKET_BIS_URL if the BIS changes its API.
 */
export const BIS_URL = "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_SPP/1.0/Q.*.N.628?format=csv";
export const BIS_SOURCE = "Bank for International Settlements, residential property price statistics";

/** Regional aggregates that are not countries. */
const NOT_COUNTRIES = new Set(["XM", "EU", "XW", "XS"]);

/** Split one CSV line, honouring double quotes. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export interface ParsedMarket { series: Record<string, IndexPoint[]>; skippedRows: number }

/**
 * Read the BIS CSV into one series per country. Columns are found by name, so their order doesn't matter. Rows that
 * aren't a country, aren't quarterly, or aren't the nominal index are skipped; a file without the columns we need is an
 * error rather than an empty result, so a changed format fails loudly instead of quietly wiping the data.
 */
export function parseBisCsv(text: string): ParsedMarket {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error("empty_response");
  const head = splitCsv(lines[0]).map((h) => h.trim().toUpperCase());
  const col = (name: string) => head.indexOf(name);
  const area = col("REF_AREA"), time = col("TIME_PERIOD"), obs = col("OBS_VALUE");
  if (area < 0 || time < 0 || obs < 0) throw new Error("unexpected_format");
  const value = col("VALUE"), unit = col("UNIT_MEASURE"), freq = col("FREQ");

  const raw: Record<string, IndexPoint[]> = {};
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const f = splitCsv(line);
    const code = (f[area] ?? "").trim().toUpperCase();
    const period = (f[time] ?? "").trim();
    const v = Number((f[obs] ?? "").trim());
    const wrongKind =
      (value >= 0 && (f[value] ?? "").trim().toUpperCase().charAt(0) !== "N") ||
      (unit >= 0 && (f[unit] ?? "").trim() !== "628") ||
      (freq >= 0 && (f[freq] ?? "").trim().toUpperCase() !== "Q");
    if (!/^[A-Z]{2}$/.test(code) || NOT_COUNTRIES.has(code) || !isPeriod(period) || !Number.isFinite(v) || wrongKind) { skipped++; continue; }
    (raw[code] ??= []).push({ period, value: v });
  }
  const series: Record<string, IndexPoint[]> = {};
  for (const [code, pts] of Object.entries(raw)) {
    const s = cleanSeries(pts);
    if (s.length) series[code] = s;
  }
  return { series, skippedRows: skipped };
}
