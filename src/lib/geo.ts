import type { GeoPoint } from "./comps.ts";

const EARTH_RADIUS_MI = 3958.7613;

/** Great-circle distance in miles. */
export function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The saved point for an address, or null if there is none or the address has been edited since. */
export function validGeo(geo: GeoPoint | undefined, address: string): GeoPoint | null {
  return geo && geo.query === address.trim() ? geo : null;
}

/** Result kinds that mean the geocoder found an area, not the property itself. */
const AREA_TYPES = new Set([
  "country", "state", "region", "province", "county", "city", "town", "village", "municipality",
  "suburb", "neighbourhood", "quarter", "postcode", "borough", "district", "hamlet",
]);

interface NominatimHit { lat?: string; lon?: string; display_name?: string; addresstype?: string; type?: string }

export function parseNominatim(json: unknown, query: string): GeoPoint | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const hit = json[0] as NominatimHit;
  const lat = Number(hit.lat), lng = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const kind = (hit.addresstype ?? hit.type ?? "").toLowerCase();
  return { lat, lng, label: String(hit.display_name ?? query).slice(0, 300), query, precise: !AREA_TYPES.has(kind) };
}

export type GeocodeResult =
  | { status: "ok"; point: GeoPoint }
  | { status: "not_found" }
  | { status: "error"; message: string };

export const DEFAULT_GEOCODER_URL = "https://nominatim.openstreetmap.org/search";

export async function geocodeAddress(
  address: string,
  opts: { baseUrl?: string; fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<GeocodeResult> {
  const query = address.trim();
  if (!query) return { status: "not_found" };
  const base = opts.baseUrl || DEFAULT_GEOCODER_URL;
  const url = `${base}${base.includes("?") ? "&" : "?"}format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, { headers: { Accept: "application/json" }, signal: opts.signal });
    if (!res.ok) return { status: "error", message: res.status === 429 ? "The geocoding service asked us to slow down. Try again in a minute." : `The geocoding service returned an error (${res.status}).` };
    const point = parseNominatim(await res.json(), query);
    return point ? { status: "ok", point } : { status: "not_found" };
  } catch (e) {
    return { status: "error", message: e instanceof Error && e.name === "AbortError" ? "Cancelled." : "Could not reach the geocoding service." };
  }
}

/** Public geocoders allow roughly one request per second. */
export const GEOCODE_DELAY_MS = 1100;
