import { test } from "node:test";
import assert from "node:assert/strict";
import { geocodeAddress, haversineMiles, parseNominatim, validGeo } from "./geo.ts";

const dc = { lat: 38.8977, lng: -77.0365 };
const nyc = { lat: 40.7128, lng: -74.006 };

test("haversine: known city pair and zero distance", () => {
  const d = haversineMiles(dc, nyc);
  assert.ok(d > 202 && d < 206, String(d)); // ~204 miles
  assert.equal(haversineMiles(dc, dc), 0);
  assert.ok(Math.abs(haversineMiles(dc, nyc) - haversineMiles(nyc, dc)) < 1e-9);
});

test("parse: reads the first hit and marks building-level matches as precise", () => {
  const p = parseNominatim([{ lat: "38.89", lon: "-77.03", display_name: "1600 Pennsylvania Avenue NW, Washington", addresstype: "building" }], "1600 Penn");
  assert.deepEqual(p, { lat: 38.89, lng: -77.03, label: "1600 Pennsylvania Avenue NW, Washington", query: "1600 Penn", precise: true });
});

test("parse: area-level matches are flagged as imprecise", () => {
  assert.equal(parseNominatim([{ lat: "1", lon: "2", addresstype: "city" }], "q")!.precise, false);
  assert.equal(parseNominatim([{ lat: "1", lon: "2", type: "suburb" }], "q")!.precise, false);
});

test("parse: rejects empty, malformed and out-of-range results", () => {
  assert.equal(parseNominatim([], "q"), null);
  assert.equal(parseNominatim({ not: "an array" }, "q"), null);
  assert.equal(parseNominatim([{ lat: "abc", lon: "2" }], "q"), null);
  assert.equal(parseNominatim([{ lat: "95", lon: "2" }], "q"), null);
});

test("validGeo ignores a point once the address text has changed", () => {
  const g = { lat: 1, lng: 2, label: "x", query: "12 Maple St, Springfield", precise: true };
  assert.equal(validGeo(g, "12 Maple St, Springfield "), g);
  assert.equal(validGeo(g, "14 Maple St, Springfield"), null);
  assert.equal(validGeo(undefined, "anything"), null);
});

const ok = (body: unknown, status = 200) => (async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch;

test("geocode: success builds a request with the encoded address and returns the point", async () => {
  let seen = "";
  const f = (async (u: string) => { seen = u; return { ok: true, status: 200, json: async () => [{ lat: "10", lon: "20", display_name: "Somewhere", addresstype: "house" }] }; }) as unknown as typeof fetch;
  const r = await geocodeAddress(" 12 Maple St & Co, Springfield ", { fetchImpl: f });
  assert.equal(r.status, "ok");
  assert.ok(seen.startsWith("https://nominatim.openstreetmap.org/search?"));
  assert.ok(seen.includes("q=12%20Maple%20St%20%26%20Co%2C%20Springfield"));
  assert.ok(seen.includes("format=jsonv2") && seen.includes("limit=1"));
});

test("geocode: custom base URL is used", async () => {
  let seen = "";
  const f = (async (u: string) => { seen = u; return { ok: true, status: 200, json: async () => [] }; }) as unknown as typeof fetch;
  await geocodeAddress("x", { baseUrl: "https://geo.example.com/search", fetchImpl: f });
  assert.ok(seen.startsWith("https://geo.example.com/search?"));
});

test("geocode: not found, blank input, rate limit, server error and network failure", async () => {
  assert.deepEqual(await geocodeAddress("nowhere", { fetchImpl: ok([]) }), { status: "not_found" });
  assert.deepEqual(await geocodeAddress("   ", { fetchImpl: ok([]) }), { status: "not_found" });
  const limited = await geocodeAddress("x", { fetchImpl: ok({}, 429) });
  assert.deepEqual(limited, { status: "error", code: "rate_limited", httpStatus: 429 });
  const bad = await geocodeAddress("x", { fetchImpl: ok({}, 500) });
  assert.deepEqual(bad, { status: "error", code: "http", httpStatus: 500 });
  const down = await geocodeAddress("x", { fetchImpl: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch });
  assert.deepEqual(down, { status: "error", code: "network" });
  const aborted = await geocodeAddress("x", { fetchImpl: (async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch });
  assert.deepEqual(aborted, { status: "error", code: "cancelled" });
});
