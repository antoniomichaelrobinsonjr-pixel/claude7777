export interface Subject {
  address: string;
  sqft: number;
  beds: number;
  baths: number;
  yearBuilt: number;
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
    .filter((c) => c.included)
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
    comps: [],
    rates: { ...DEFAULT_RATES },
    updatedAt: new Date().toISOString(),
  };
}

export const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
