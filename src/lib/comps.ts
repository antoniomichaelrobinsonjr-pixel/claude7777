/** A geocoded location, saved with the exact address text it was found for. */
export interface GeoPoint {
  lat: number;
  lng: number;
  /** The address the geocoder says it matched, so a wrong match is visible. */
  label: string;
  /** The address text that was sent; the point is ignored if the address is edited afterwards. */
  query: string;
  /** False when the geocoder only matched a street, suburb or city rather than the building. */
  precise: boolean;
}

export interface Subject {
  address: string;
  sqft: number;
  beds: number;
  baths: number;
  yearBuilt: number;
  geo?: GeoPoint;
}

export interface Comp {
  id: string;
  address: string;
  salePrice: number;
  saleDate: string;
  sqft: number;
  beds: number;
  baths: number;
  yearBuilt: number;
  distanceMi: number;
  /** Manual dollar adjustment for condition, lot, upgrades, etc. */
  otherAdj: number;
  included: boolean;
  /** Where this sale came from (MLS number, county record, ...). Shown in the report. */
  source?: string;
  geo?: GeoPoint;
  /** True when distanceMi was calculated from geocoded coordinates rather than typed in. */
  distanceComputed?: boolean;
}

/** Dollar value of one unit of difference between subject and comp. */
export interface Rates {
  perSqft: number;
  perBed: number;
  perBath: number;
  perYear: number;
}

export interface Project {
  id: string;
  name: string;
  subject: Subject;
  comps: Comp[];
  rates: Rates;
  updatedAt: string;
  preparedBy?: string;
  preparedFor?: string;
  /** Where the adjustment rates came from (paired sales study, appraiser input, ...). */
  ratesBasis?: string;
  /** Relative importance of each reliability check (0-10). Missing = 1 (equal weighting). */
  checkWeights?: Partial<Record<"count" | "recency" | "proximity" | "similarity" | "consistency", number>>;
}

export const DEFAULT_RATES: Rates = { perSqft: 60, perBed: 5000, perBath: 7500, perYear: 500 };

export interface AdjustedComp {
  comp: Comp;
  sqftAdj: number;
  bedAdj: number;
  bathAdj: number;
  ageAdj: number;
  netAdj: number;
  grossAdjPct: number;
  adjustedPrice: number;
  pricePerSqft: number;
  weight: number;
}

/** Adjustments move the comp toward the subject: subject better => positive. */
export function adjustComp(subject: Subject, comp: Comp, rates: Rates): AdjustedComp {
  const sqftAdj = (subject.sqft - comp.sqft) * rates.perSqft;
  const bedAdj = (subject.beds - comp.beds) * rates.perBed;
  const bathAdj = (subject.baths - comp.baths) * rates.perBath;
  const ageAdj = (subject.yearBuilt - comp.yearBuilt) * rates.perYear;
  const netAdj = sqftAdj + bedAdj + bathAdj + ageAdj + comp.otherAdj;
  const gross =
    Math.abs(sqftAdj) + Math.abs(bedAdj) + Math.abs(bathAdj) + Math.abs(ageAdj) + Math.abs(comp.otherAdj);
  const grossAdjPct = comp.salePrice > 0 ? (gross / comp.salePrice) * 100 : 0;
  const adjustedPrice = comp.salePrice + netAdj;
  // Comps needing fewer adjustments count more.
  const weight = 1 / (1 + grossAdjPct / 10);
  return {
    comp,
    sqftAdj,
    bedAdj,
    bathAdj,
    ageAdj,
    netAdj,
    grossAdjPct,
    adjustedPrice,
    pricePerSqft: comp.sqft > 0 ? comp.salePrice / comp.sqft : 0,
    weight,
  };
}

export interface Analysis {
  rows: AdjustedComp[];
  count: number;
  low: number;
  high: number;
  mean: number;
  median: number;
  weighted: number;
}

export function analyze(project: Pick<Project, "subject" | "comps" | "rates">): Analysis {
  const rows = project.comps
    .filter((c) => c.included && c.salePrice > 0)
    .map((c) => adjustComp(project.subject, c, project.rates));
  if (rows.length === 0) return { rows, count: 0, low: 0, high: 0, mean: 0, median: 0, weighted: 0 };
  const prices = rows.map((r) => r.adjustedPrice).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  const totalW = rows.reduce((s, r) => s + r.weight, 0);
  const weighted = rows.reduce((s, r) => s + r.adjustedPrice * r.weight, 0) / totalW;
  return { rows, count: rows.length, low: prices[0], high: prices[prices.length - 1], mean, median, weighted };
}

export function newComp(): Comp {
  return {
    id: crypto.randomUUID(),
    address: "",
    salePrice: 0,
    saleDate: "",
    sqft: 0,
    beds: 0,
    baths: 0,
    yearBuilt: 0,
    distanceMi: 0,
    otherAdj: 0,
    included: true,
  };
}

export function newProject(): Project {
  return {
    id: crypto.randomUUID(),
    name: "Untitled analysis",
    subject: { address: "", sqft: 0, beds: 0, baths: 0, yearBuilt: 0 },
    comps: [newComp(), newComp(), newComp()],
    rates: { ...DEFAULT_RATES },
    updatedAt: new Date().toISOString(),
  };
}

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Illustrative data so a new user can see the tool working before typing their own. */
export function exampleData(): Pick<Project, "name" | "subject" | "comps"> {
  const mk = (address: string, salePrice: number, saleDate: string, sqft: number, beds: number, baths: number, yearBuilt: number, distanceMi: number): Comp =>
    ({ ...newComp(), address, salePrice, saleDate, sqft, beds, baths, yearBuilt, distanceMi });
  return {
    name: "Example: 12 Maple St",
    subject: { address: "12 Maple St", sqft: 1850, beds: 3, baths: 2, yearBuilt: 1998 },
    comps: [
      mk("48 Oak Ave", 412000, "2026-08-14", 1790, 3, 2, 1995, 0.3),
      mk("7 Birch Ln", 436000, "2026-07-02", 1920, 3, 2.5, 2001, 0.5),
      mk("203 Pine Rd", 398000, "2026-09-05", 1750, 3, 2, 1990, 0.8),
    ],
  };
}
