import type { PropertyKind } from "./comps.ts";

/**
 * How demanding the reliability checks are for each kind of property. Apartments in the same neighbourhood should be
 * very close; estates and land sell rarely and are spread out, so recency and distance are judged over a longer reach.
 */
export interface KindProfile {
  /** Median days since sale: full marks at or below `recencyFull`, zero at or beyond `recencyZero`. */
  recencyFull: number;
  recencyZero: number;
  /** Average distance in miles: full marks at or below `proxFull`, zero at or beyond `proxZero`. */
  proxFull: number;
  proxZero: number;
  /** A comp farther than this many miles, or older than this many days, is flagged. */
  farMi: number;
  oldDays: number;
}

const HOME: KindProfile = { recencyFull: 90, recencyZero: 365, proxFull: 0.5, proxZero: 3, farMi: 1, oldDays: 180 };

export const PROFILES: Record<PropertyKind, KindProfile> = {
  home: HOME,
  apartment: { ...HOME, proxFull: 0.25, proxZero: 2, farMi: 0.5 },
  condo: { ...HOME, proxFull: 0.25, proxZero: 2, farMi: 0.5 },
  estate: { recencyFull: 180, recencyZero: 730, proxFull: 2, proxZero: 15, farMi: 5, oldDays: 365 },
  land: { recencyFull: 180, recencyZero: 730, proxFull: 1, proxZero: 10, farMi: 3, oldDays: 365 },
};

export const profileFor = (kind: PropertyKind | undefined): KindProfile => PROFILES[kind ?? "home"] ?? HOME;
export const isHomeProfile = (p: KindProfile) => p === HOME;
