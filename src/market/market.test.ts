import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSeries, driftSince, latestPoint, periodFromNumber, periodNumber, periodOf, yearOnYear, type IndexPoint } from "./series.ts";
import { parseBisCsv } from "./bis.ts";
import { MIN_COUNTRIES, MIN_QUARTERS, refreshMarket, type MarketStore } from "./refresh.ts";
import { processMarketRead, processMarketRefresh, safeEqual } from "./http.ts";

const q = (n: number, value: number): IndexPoint => ({ period: periodFromNumber(2020 * 4 + n), value });
const rising = Array.from({ length: 12 }, (_, i) => q(i, 100 + i * 2)); // 2020-Q1 .. 2022-Q4, 100 .. 122

test("periods: quarter of a date, round trip, and rejection of bad dates", () => {
  assert.equal(periodOf("2024-01-01"), "2024-Q1");
  assert.equal(periodOf("2024-03-31"), "2024-Q1");
  assert.equal(periodOf("2024-04-01"), "2024-Q2");
  assert.equal(periodOf("2024-12-31"), "2024-Q4");
  assert.equal(periodOf("2024-13-01"), null);
  assert.equal(periodOf(""), null);
  assert.equal(periodFromNumber(periodNumber("2023-Q4")), "2023-Q4");
  assert.equal(periodNumber("2024-Q1") - periodNumber("2023-Q4"), 1);
});

test("series: sorted, de-duplicated, and bad points dropped", () => {
  const s = cleanSeries([q(2, 3), q(0, 1), q(0, 5), { period: "nonsense", value: 9 }, q(1, NaN), q(3, -4), q(4, 0)]);
  assert.deepEqual(s.map((p) => p.value), [5, 3]);
  assert.equal(latestPoint([]), null);
});

test("year on year compares with four quarters earlier, and is null without enough history", () => {
  assert.ok(Math.abs(yearOnYear(rising)! - ((122 / 114 - 1) * 100)) < 1e-9);
  assert.equal(yearOnYear(rising.slice(-4)), null);
  assert.equal(yearOnYear([]), null);
});

test("drift since a sale: index now over index in the sale quarter", () => {
  assert.ok(Math.abs(driftSince(rising, "2021-02-10")! - ((122 / 108 - 1) * 100)) < 1e-9);
  assert.equal(driftSince(rising, "2022-11-01"), 0, "a sale in the latest quarter has not drifted");
  assert.equal(driftSince(rising, "2023-02-01"), null, "a sale after the latest published quarter can't be measured");
  assert.equal(driftSince(rising, "2015-05-05"), null, "before the series starts");
  assert.equal(driftSince(rising, "not a date"), null);
});

const header = "FREQ,REF_AREA,VALUE,UNIT_MEASURE,TIME_PERIOD,OBS_VALUE";
const rows = (area: string, n: number, opts: { value?: string; unit?: string; freq?: string } = {}) =>
  Array.from({ length: n }, (_, i) => `${opts.freq ?? "Q"},${area},${opts.value ?? "N"},${opts.unit ?? "628"},${periodFromNumber(2018 * 4 + i)},${100 + i}`);

test("BIS csv: countries parsed by column name; aggregates, other units and other kinds are skipped", () => {
  const csv = [header, ...rows("GB", 10), ...rows("XM", 10), ...rows("5R", 10), ...rows("US", 10, { value: "R" }), ...rows("DE", 10, { unit: "771" }), ...rows("FR", 10, { freq: "A" }),
    "Q,JP,N,628,2020-Q9,5", "Q,JP,N,628,2020-Q1,abc"].join("\r\n");
  const { series, skippedRows } = parseBisCsv(csv);
  assert.deepEqual(Object.keys(series), ["GB"]);
  assert.equal(series.GB.length, 10);
  assert.ok(skippedRows >= 52);
  // Column order must not matter, and quoting is honoured.
  const shuffled = `"OBS_VALUE","TIME_PERIOD","REF_AREA"\n"101.5","2020-Q1","gb"\n`;
  assert.deepEqual(parseBisCsv(shuffled).series.GB, [{ period: "2020-Q1", value: 101.5 }]);
});

test("BIS csv: a changed or empty format is an error, never an empty success", () => {
  assert.throws(() => parseBisCsv(""), /empty_response/);
  assert.throws(() => parseBisCsv("<html>Service unavailable</html>"), /unexpected_format/);
  assert.throws(() => parseBisCsv("A,B,C\n1,2,3"), /unexpected_format/);
});

function fakeStore() {
  const saved = new Map<string, IndexPoint[]>();
  let meta: unknown = null;
  const store: MarketStore = { saveCountry: async (c, s) => { saved.set(c, s); }, saveMeta: async (m) => { meta = m; } };
  return { store, saved, get meta() { return meta; } };
}
const manyCountries = (n: number, quarters = 12) => {
  const codes: string[] = [];
  for (let i = 0; i < n; i++) codes.push(String.fromCharCode(65 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26)));
  return [header, ...codes.flatMap((c) => rows(c, quarters))].join("\n");
};

test("refresh: saves every usable country and records when and from where", async () => {
  const f = fakeStore();
  const r = await refreshMarket({ fetchText: async () => manyCountries(MIN_COUNTRIES + 5), url: "x", store: f.store, now: () => new Date("2025-03-01T05:00:00Z") });
  assert.equal(r.countries, MIN_COUNTRIES + 5);
  assert.equal(f.saved.size, MIN_COUNTRIES + 5);
  assert.equal((f.meta as { fetchedAt: string }).fetchedAt, "2025-03-01T05:00:00.000Z");
  assert.equal(r.latestPeriod, "2020-Q4");
});

test("refresh: a broken download saves nothing (yesterday's data stays)", async () => {
  for (const body of [manyCountries(MIN_COUNTRIES - 1), "<html>oops</html>", "", manyCountries(MIN_COUNTRIES + 3, MIN_QUARTERS - 1)]) {
    const f = fakeStore();
    await assert.rejects(refreshMarket({ fetchText: async () => body, url: "x", store: f.store }));
    assert.equal(f.saved.size, 0);
    assert.equal(f.meta, null);
  }
  const f = fakeStore();
  await assert.rejects(refreshMarket({ fetchText: async () => { throw new Error("source_http_500"); }, url: "x", store: f.store }), /source_http_500/);
  assert.equal(f.saved.size, 0);
});

test("refresh: countries with too little history are skipped, not saved", async () => {
  const f = fakeStore();
  const csv = [manyCountries(MIN_COUNTRIES + 1), ...rows("ZZ", MIN_QUARTERS - 1)].join("\n");
  const r = await refreshMarket({ fetchText: async () => csv, url: "x", store: f.store });
  assert.deepEqual(r.skippedCountries, ["ZZ"]);
  assert.ok(!f.saved.has("ZZ"));
});

test("cron endpoint: needs the secret, constant-time compared; failures return 502 and write nothing", async () => {
  const f = fakeStore();
  const deps = { fetchText: async () => manyCountries(MIN_COUNTRIES), url: "x", store: f.store };
  assert.equal((await processMarketRefresh("Bearer s3cret", undefined, deps)).status, 503);
  assert.equal((await processMarketRefresh(null, "s3cret", deps)).status, 401);
  assert.equal((await processMarketRefresh("Bearer wrong", "s3cret", deps)).status, 401);
  assert.equal(f.saved.size, 0);
  assert.equal((await processMarketRefresh("Bearer s3cret", "s3cret", deps)).status, 200);
  assert.equal(f.saved.size, MIN_COUNTRIES);
  const bad = fakeStore();
  const r = await processMarketRefresh("Bearer s3cret", "s3cret", { ...deps, fetchText: async () => "<html/>", store: bad.store });
  assert.equal(r.status, 502);
  assert.equal(bad.saved.size, 0);
  assert.ok(safeEqual("abc", "abc") && !safeEqual("abc", "abd") && !safeEqual("abc", "abcd"));
});

const readDeps = (o: Partial<Parameters<typeof processMarketRead>[0]> = {}) => ({
  billingEnabled: true, user: { id: "u1" }, country: "GB",
  loadPlan: async () => ({ plan: "plus" as const, status: "active" }),
  load: async () => ({ series: rising, fetchedAt: "2025-03-01T05:00:00.000Z", source: "BIS" }),
  meta: async () => ({ fetchedAt: "2025-03-01T05:00:00.000Z", source: "BIS" }),
  ...o,
});

test("market read: paid plans only when billing is on; open when it is off", async () => {
  assert.equal((await processMarketRead(readDeps())).status, 200);
  assert.equal((await processMarketRead(readDeps({ user: null }))).status, 401);
  assert.equal((await processMarketRead(readDeps({ loadPlan: async () => null }))).status, 403, "no profile = starter");
  assert.equal((await processMarketRead(readDeps({ loadPlan: async () => ({ plan: "pro", status: "canceled" }) }))).status, 403, "a cancelled plan has no access");
  assert.equal((await processMarketRead(readDeps({ loadPlan: async () => ({ plan: "pro", status: "trialing" }) }))).status, 200, "a trial counts");
  assert.equal((await processMarketRead(readDeps({ billingEnabled: false, user: null }))).status, 200);
});

test("market read: validates the country and says plainly when there is no data", async () => {
  for (const c of [null, "", "G", "GBR", "1A", "../x"]) assert.equal((await processMarketRead(readDeps({ country: c }))).status, 400, String(c));
  const r = await processMarketRead(readDeps({ country: "gb", load: async () => null }));
  assert.deepEqual(r.body, { country: "GB", available: false, updatedAt: "2025-03-01T05:00:00.000Z" });
});
