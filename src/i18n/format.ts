/** Pure translation + formatting helpers (no React) so they can be unit-tested and used by report logic. */

export type NumKind = "int" | "dec1" | "dec2" | "usd" | "pct1" | "pct0";
/** A number that the translator function formats for the active locale. */
export interface Num { v: number; f: NumKind }
export type Var = string | number | Num;
export type Vars = Record<string, Var>;
export interface Msg { key: string; vars?: Vars }

export const n = {
  int: (v: number): Num => ({ v, f: "int" }),
  dec1: (v: number): Num => ({ v, f: "dec1" }),
  dec2: (v: number): Num => ({ v, f: "dec2" }),
  usd: (v: number): Num => ({ v, f: "usd" }),
  pct1: (v: number): Num => ({ v, f: "pct1" }),
  pct0: (v: number): Num => ({ v, f: "pct0" }),
};
export const msg = (key: string, vars?: Vars): Msg => ({ key, vars });

/** Always Western digits (0-9) so prices read the same everywhere and can be pasted into other tools. */
const tagOf = (intl: string) => `${intl}-u-nu-latn`;

const cache = new Map<string, Intl.NumberFormat>();
function nf(intl: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const k = intl + JSON.stringify(opts);
  let f = cache.get(k);
  if (!f) { f = new Intl.NumberFormat(tagOf(intl), opts); cache.set(k, f); }
  return f;
}

export function formatNum(intl: string, x: Num): string {
  switch (x.f) {
    case "int": return nf(intl, { maximumFractionDigits: 0 }).format(x.v);
    case "dec1": return nf(intl, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(x.v);
    case "dec2": return nf(intl, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x.v);
    case "usd": return nf(intl, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(x.v);
    case "pct1": return nf(intl, { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(x.v / 100);
    case "pct0": return nf(intl, { style: "percent", maximumFractionDigits: 0 }).format(x.v / 100);
  }
}

export const usdIn = (intl: string, v: number) => formatNum(intl, n.usd(v));

export function formatDate(intl: string, d: Date | number, opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" }): string {
  return new Intl.DateTimeFormat(tagOf(intl), opts).format(d);
}

export type Dict = Record<string, string>;

function pluralCategory(intl: string, count: number): string {
  try { return new Intl.PluralRules(intl).select(count); } catch { return "other"; }
}

/**
 * Look up `key` (choosing a plural form when vars.count is a number) in `messages`, then in `fallback`,
 * and fill in {placeholders}. Missing keys fall back to English, then to the key itself.
 */
export function translate(messages: Dict, fallback: Dict, intl: string, key: string, vars?: Vars): string {
  let template: string | undefined;
  const count = vars && typeof vars.count === "number" ? vars.count : vars && typeof vars.count === "object" ? vars.count.v : undefined;
  for (const dict of [messages, fallback]) {
    if (count !== undefined) {
      const cat = pluralCategory(dict === messages ? intl : "en", count);
      template = dict[`${key}.${cat}`] ?? dict[`${key}.other`];
    }
    template = template ?? dict[key];
    if (template !== undefined) break;
  }
  if (template === undefined) return key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars?.[name];
    if (v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number") return nf(intl, { maximumFractionDigits: 2 }).format(v);
    return formatNum(intl, v);
  });
}

export const resolveMsg = (m: Msg, messages: Dict, fallback: Dict, intl: string) => translate(messages, fallback, intl, m.key, m.vars);

// ---- Typed-number handling (prices) --------------------------------------------------------

export function separators(intl: string): { decimal: string; group: string } {
  const parts = new Intl.NumberFormat(tagOf(intl)).formatToParts(1234567.8);
  return {
    decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
    group: parts.find((p) => p.type === "group")?.value ?? ",",
  };
}

const DIGIT_RANGES = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0e50, 0x0ed0, 0x1040, 0x0d66, 0x0be6, 0x0c66, 0x0ce6]; // Arabic-Indic, Persian, Devanagari, Bengali, Thai, Lao, Myanmar, Malayalam, Tamil, Telugu, Kannada

/** Turn digits from other numeral systems (e.g. Arabic-Indic, Devanagari) into 0-9. */
export function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹०-९০-৯๐-๙໐-໙၀-၉൦-൯௦-௯౦-౯೦-೯]/g, (ch) => {
    const cp = ch.codePointAt(0)!;
    const base = DIGIT_RANGES.find((b) => cp >= b && cp <= b + 9)!;
    return String(cp - base);
  });
}

/**
 * Read what someone typed into a price field in their locale and return the cleaned display text and its value.
 * The locale's decimal mark starts the fraction; every other symbol (group marks, spaces, currency) is dropped.
 * "412.000" is 412000 in German but 412 in English.
 */
export function readMoney(raw: string, intl: string, allowNegative = false): { text: string; value: number } {
  const { decimal } = separators(intl);
  let s = normalizeDigits(raw).replace(/٫/g, decimal).replace(/٬/g, "");
  const neg = allowNegative && /^[\s]*[-−‎‏]*[-−]/.test(s);
  let int = "";
  let frac: string | null = null;
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") { if (frac === null) int += ch; else if (frac.length < 2) frac += ch; }
    else if (ch === decimal && frac === null) frac = "";
  }
  int = int.replace(/^0+(?=\d)/, "");
  const intNum = int ? Number(int) : 0;
  const grouped = int ? nf(intl, { maximumFractionDigits: 0, useGrouping: true }).format(intNum) : neg || frac !== null ? "0" : "";
  const text = (neg ? "-" : "") + grouped + (frac !== null ? decimal + frac : "");
  const value = (neg ? -1 : 1) * (intNum + (frac ? Number(frac) / 10 ** frac.length : 0));
  return { text, value: Number.isFinite(value) ? value : 0 };
}

/** Display text for a stored number in a price field. */
export function showMoney(v: number, intl: string): string {
  return v === 0 ? "" : nf(intl, { maximumFractionDigits: 2 }).format(v);
}
