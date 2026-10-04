import type { Comp, PropertyKind } from "../lib/comps.ts";

/**
 * Turns a sentence someone typed or dictated into comp fields: "48 Oak Avenue, sold for $412,000 on August 14, 1,790 square
 * feet, 3 beds, 2 baths, built 1995, 0.3 miles away". It is a plain pattern reader, not guesswork: it only fills what it
 * finds, never invents a value, and the app shows the result for checking before anything is added. English only for now.
 */
export type FieldName = "address" | "salePrice" | "saleDate" | "sqft" | "beds" | "baths" | "yearBuilt" | "distanceMi" | "floor" | "parking" | "monthlyFee" | "acres" | "source";

export interface ParsedComp {
  fields: Partial<Pick<Comp, "address" | "salePrice" | "saleDate" | "sqft" | "beds" | "baths" | "yearBuilt" | "distanceMi" | "floor" | "parking" | "monthlyFee" | "acres" | "source">>;
  /** Fields that were found and apply to this property type, in a steady order. */
  found: FieldName[];
  /** Fields that were found but are not used for this property type (a floor for a house, say). */
  ignored: FieldName[];
}

export interface ParseOptions { kind?: PropertyKind; today?: Date; dateOrder?: "mdy" | "dmy" }

/** The most text that is read at once. */
export const MAX_INPUT = 20_000;

const ORDER: FieldName[] = ["address", "salePrice", "saleDate", "sqft", "acres", "beds", "baths", "yearBuilt", "floor", "parking", "monthlyFee", "distanceMi", "source"];

// ---- spoken numbers -> digits ------------------------------------------------------------------------------------

const UNITS: Record<string, number> = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9 };
const ORD_UNITS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30 };
const suffix = (n: number) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th");

const WORD = Object.keys({ ...UNITS, ...TENS, ...SCALES }).filter((w) => w !== "oh").join("|");
const RUN = new RegExp(`\\b(?:(?:${WORD})(?:[\\s-]+(?:and[\\s-]+)?|\\b))+(?:point(?:\\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|oh))+(?:\\s+(?:hundred|thousand|million|billion))*)?`, "gi");
const ENDS_IN_NUMBER = new RegExp(`(?:^|[\\s-])(?:${WORD}|\\d+(?:\\.\\d+)?)$`, "i");
const POINT_ONLY = /\bpoint((?:\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|oh))+)\b/gi;
const DIGIT_WORD = (w: string) => UNITS[w.toLowerCase()];

function runValue(run: string): string | null {
  const tokens = run.toLowerCase().replace(/-/g, " ").split(/\s+/).filter((w) => w && w !== "and");
  const pi = tokens.indexOf("point");
  const before = pi < 0 ? tokens : tokens.slice(0, pi);
  const after = pi < 0 ? [] : tokens.slice(pi + 1);
  const readInt = (words: string[]): number | null => {
    if (!words.length) return null;
    let total = 0, current = 0;
    for (const w of words) {
      if (w in UNITS) current += UNITS[w];
      else if (w in TENS) current += TENS[w];
      else if (w === "hundred") current = (current || 1) * 100;
      else if (w in SCALES) { total += (current || 1) * SCALES[w]; current = 0; }
      else return null;
    }
    return total + current;
  };
  if (pi < 0) { const v = readInt(before); return v === null ? null : String(v); }
  const whole = before.length ? readInt(before) : 0;
  const digitWords = after.filter((w) => w in UNITS && UNITS[w] < 10);
  const scaleWords = after.slice(digitWords.length);
  if (whole === null || !digitWords.length || digitWords.length + scaleWords.length !== after.length) return null;
  let v = Number(`${whole}.${digitWords.map((w) => UNITS[w]).join("")}`);
  for (const w of scaleWords) { if (!(w in SCALES)) return null; v *= SCALES[w]; }
  return String(Math.round(v * 1e6) / 1e6);
}

/** "four hundred twelve thousand" -> "412000", "two and a half" -> "2.5", "point three" -> "0.3", "august fourteenth" -> "august 14th". */
export function wordsToNumbers(input: string): string {
  let s = input;
  // fractions of a unit
  s = s.replace(/\bthree quarters of a (mile|acre)s?\b/gi, "0.75 $1s").replace(/\b(?:a\s+)?quarter(?:\s+of)?(?:\s+an?)?\s+(mile|acre)s?\b/gi, "0.25 $1s")
    .replace(/\bhalf an? (mile|acre)s?\b/gi, "0.5 $1s");
  s = s.replace(/\b(\w+(?:[\s-]\w+)?) and a half\b/gi, (m, n) => (ENDS_IN_NUMBER.test(n) ? `${n} point five` : m));
  // ordinals: "twenty-first" -> 21st
  s = s.replace(/\b(twenty|thirty)[\s-](first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)\b/gi, (_m, t, u) => { const n = TENS[t.toLowerCase()] + ORD_UNITS[u.toLowerCase()]; return `${n}${suffix(n)}`; });
  s = s.replace(new RegExp(`\\b(${Object.keys(ORD_UNITS).join("|")})\\b`, "gi"), (_m, w) => { const n = ORD_UNITS[w.toLowerCase()]; return `${n}${suffix(n)}`; });
  s = s.replace(/\ba (hundred|thousand|million)\b/gi, "one $1");
  s = s.replace(/(\d+)\s+point((?:\s+(?:zero|one|two|three|four|five|six|seven|eight|nine|oh))+)\b/gi, (_m, i, d) => `${i}.${String(d).trim().split(/\s+/).map(DIGIT_WORD).join("")}`);
  s = s.replace(POINT_ONLY, (m, d, offset: number) => (new RegExp(`(?:\\d|\\b(?:${WORD}))[\\s-]*$`, "i").test(s.slice(0, offset)) ? m : `0.${String(d).trim().split(/\s+/).map(DIGIT_WORD).join("")}`));
  s = s.replace(RUN, (run, offset: number) => {
    // "4.2 million" or "412 thousand": the digits are already there and the scale word only multiplies them
    if (/^(?:hundred|thousand|million|billion)\b/i.test(run.trim()) && /\d[\s.]*$/.test(s.slice(0, offset))) return run;
    const trailing = /(\s+and)?[\s-]*$/i.exec(run)?.[0] ?? "";
    const core = run.slice(0, run.length - (/^[\s-]*$/.test(trailing) ? trailing.length : 0)).replace(/(\s+and)[\s-]*$/i, "");
    const v = runValue(core);
    return v === null ? run : v + (core.length < run.length ? " " : "");
  });
  return s;
}

// ---- dates -------------------------------------------------------------------------------------------------------

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const monthIndex = (m: string) => MONTHS.findIndex((x) => x.startsWith(m.toLowerCase().slice(0, 3)));

function validDate(y: number, mo: number, d: number): string | null {
  if (!(y >= 1900 && y <= 2100) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** A year was not said: use this year, or last year if that date would be in the future. */
function inferYear(mo: number, d: number, today: Date): number {
  const y = today.getUTCFullYear();
  return new Date(Date.UTC(y, mo - 1, d)) > today ? y - 1 : y;
}

function findDate(s: string, opts: ParseOptions): { value: string; span: [number, number] } | null {
  const today = opts.today ?? new Date();
  let m: RegExpExecArray | null;
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s))) { const v = validDate(+m[1], +m[2], +m[3]); if (v) return { value: v, span: [m.index, m.index + m[0].length] }; }
  if ((m = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/.exec(s))) {
    const [a, b] = [+m[1], +m[2]];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const v = opts.dateOrder === "dmy" ? validDate(y, b, a) : validDate(y, a, b);
    if (v) return { value: v, span: [m.index, m.index + m[0].length] };
  }
  if ((m = new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*((?:19|20)\\d{2})\\b(?!\\s*(?:sq|square|sf|bed|bath|acre|mile|mi\\b|dollars)))?\\b`, "i").exec(s))) {
    const mo = monthIndex(m[1]) + 1, d = +m[2];
    const v = validDate(m[3] ? +m[3] : inferYear(mo, d, today), mo, d);
    if (v) return { value: v, span: [m.index, m.index + m[0].length] };
  }
  if ((m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:,?\\s*((?:19|20)\\d{2})\\b(?!\\s*(?:sq|square|sf|bed|bath|acre|mile|mi\\b|dollars)))?\\b`, "i").exec(s))) {
    const mo = monthIndex(m[2]) + 1, d = +m[1];
    const v = validDate(m[3] ? +m[3] : inferYear(mo, d, today), mo, d);
    if (v) return { value: v, span: [m.index, m.index + m[0].length] };
  }
  if ((m = new RegExp(`\\b(?:in\\s+)?${MONTH_RE},?\\s+(\\d{4})\\b`, "i").exec(s))) {
    const v = validDate(+m[2], monthIndex(m[1]) + 1, 15); // only the month was said: the middle of it, which the person can correct
    if (v) return { value: v, span: [m.index, m.index + m[0].length] };
  }
  return null;
}

// ---- the reader --------------------------------------------------------------------------------------------------

const num = (t: string) => Number(t.replace(/,/g, ""));
const MONTH_NAMES = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const ORD_WORDS = Object.keys(ORD_UNITS).join("|");
const UNIT_WORDS = "sq|square|sqft|bed|beds|bedroom|bedrooms|bath|baths|bathroom|bathrooms|br|ba|acres?|miles?|mi";
/** The first thing after the address that is clearly a different detail. */
const STOP = new RegExp(
  `\\b(?:sold|selling|sale|closed|price|priced|built|year|floor|parking|garage|hoa|mls|source|about|around|roughly|square|sq|sqft|bed|beds|bedroom|bedrooms|bath|baths|bathroom|bathrooms)\\b` +
  `|\\bmiles?\\b(?!\\s+(?:high|road|rd|street|st|drive|dr|lane|ln|avenue|ave|way|court|ct)\\b)` +
  `|\\b(?:for|at)(?=\\s+(?:\\$|\\d|${WORD}|a\\s+(?:hundred|thousand)))` +
  `|\\bon(?=\\s+(?:the\\s+)?(?:\\d|${MONTH_NAMES}\\b|${ORD_WORDS}\\b))` +
  `|\\$|\\.?\\d[\\d,.]*[\\s-]*(?:${UNIT_WORDS}|k)\\b(?!\\s+(?:high|road|rd|street|st|drive|dr|lane|ln|avenue|ave|way|court|ct)\\b)`,
  "i",
);
/** A number (digits or words) hanging off the end of the address that belongs to the next detail: "... Main St 4 bedrooms". */
const NUMBER_TAIL = new RegExp(`(?:(?:\\d[\\d,.]*|${WORD}|point|and|half|halves|quarters?|an?|of|within|approximately|nearly|almost|roughly|about|around|over|under|only|just)[\\s-]+)+$`, "i");
const LEAD_DETAIL = new RegExp(`^[\\s$]*(?:(?:sold|selling|sale|closed|for|at|price|priced|on|about|around|roughly|hoa|association|maintenance|building|condo|monthly|mls|source|built|year|floor|parking|garage|bed|beds|bedroom|bedrooms|bath|baths|bathroom|bathrooms|square|sq|sqft|miles?|acres?)\\b|\\d[\\d,.]*[\\s-]*(?:${UNIT_WORDS}|k|dollars)\\b(?!\\s+(?:high|road|rd|street|st|drive|dr|lane|ln|avenue|ave|way|court|ct)\\b)|(?:${WORD}|point|a|an|half|quarter)\\b(?:[\\s-]+\\w+){0,4}?[\\s-]+(?:${UNIT_WORDS}|dollars)\\b)`, "i");
const STREET_WORD = /\b(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|boulevard|blvd|way|place|pl|terrace|circle|highway|hwy|trail|loop|tower|towers|building|estate|manor|villa|house|unit|apartment|apt|suite|lot|plaza|park|heights|residences|condo|penthouse|flat|farm|ranch)\b/i;

/** Where the street address ends: the first thing that is clearly a different detail. */
function splitAddress(chunk: string): { address: string; rest: string } {
  const lead = chunk.replace(/^\s*(?:comp(?:arable)?\s*(?:number\s*)?\d*\s*[:,-]?\s*)/i, "");
  if (LEAD_DETAIL.test(lead)) return { address: "", rest: lead };
  // the address may itself start with digits (48 Oak Avenue), so look for a stop after the first word
  const first = /^\S+\s*/.exec(lead)?.[0].length ?? 0;
  const m = STOP.exec(lead.slice(first));
  let idx = m ? first + m.index : lead.length;
  if (m) { const tail = NUMBER_TAIL.exec(lead.slice(first, idx)); if (tail) idx -= tail[0].length; }
  const address = lead.slice(0, idx).replace(/[\s,;:.-]+$/g, "").trim();
  return /[a-z]/i.test(address) ? { address, rest: lead.slice(idx) } : { address: "", rest: lead };
}

function takeFirst(s: string, re: RegExp): { m: RegExpExecArray | null; rest: string } {
  const m = re.exec(s);
  return m ? { m, rest: s.slice(0, m.index) + " " + s.slice(m.index + m[0].length) } : { m: null, rest: s };
}

export function parseComp(chunk: string, opts: ParseOptions = {}): ParsedComp {
  const kind: PropertyKind = opts.kind ?? "home";
  const f: ParsedComp["fields"] = {};
  const seen = new Set<FieldName>();
  const put = <K extends keyof ParsedComp["fields"]>(k: K & FieldName, v: ParsedComp["fields"][K]) => { f[k] = v; seen.add(k); };

  const { address, rest: afterAddress } = splitAddress(chunk.replace(/[“”]/g, '"').replace(/’/g, "'"));
  if (address) put("address", address);
  let s = wordsToNumbers(afterAddress).replace(/(\d),(\d{3})\b/g, "$1$2").replace(/(\d),(\d{3})\b/g, "$1$2");

  let t = takeFirst(s, /\bsource[:\s]+([^,.;]+)/i); s = t.rest;
  const mls = t.m ? null : takeFirst(s, /\bmls\s*(?:number|no\.?|#)?\s*:?\s*#?\s*([a-z0-9-]*\d[a-z0-9-]*)/i);
  if (t.m) put("source", t.m[1].trim()); else if (mls?.m) { put("source", `MLS #${mls.m[1]}`); s = mls.rest; }

  // monthly fee before price, so it is never mistaken for the sale price
  t = takeFirst(s, /(?:\b(?:hoa|association|maintenance|building|condo|monthly)\s*(?:fee|fees|dues|charge|charges)?\s*(?:of|is|at|are)?\s*\$?\s*(\d+(?:\.\d+)?)(?!\s*(?:sq|square|sqft|bed|bath|acre|mile))(?:\s*(?:a|per|\/)\s*month(?:ly)?)?|\$\s*(\d+(?:\.\d+)?)\s*(?:(?:a|per|\/)\s*)?month(?:ly)?(?:\s*(?:hoa|association|maintenance))?(?:\s*(?:fee|fees|dues|charge|charges))?|\$\s*(\d+(?:\.\d+)?)\s*(?:hoa|association|maintenance|condo)\s*(?:fee|fees|dues|charge|charges))/i); s = t.rest;
  if (t.m) put("monthlyFee", num(t.m[1] ?? t.m[2] ?? t.m[3]));

  const d = findDate(s, opts);
  if (d) { put("saleDate", d.value); s = s.slice(0, d.span[0]) + " " + s.slice(d.span[1]); }

  t = takeFirst(s, /(\d+(?:\.\d+)?|\.\d+)\s*(?:miles?|mi)\b(?:\s*(?:away|from\s+\w+))?/i); s = t.rest;
  if (t.m) put("distanceMi", num(t.m[1]));

  t = takeFirst(s, /(\d[\d.]*)\s*(?:sq\.?\s*ft\.?|sqft|square\s*(?:feet|foot|ft)|sf\b|feet\s*squared|ft2|ft²)/i); s = t.rest;
  if (t.m) put("sqft", num(t.m[1]));
  t = takeFirst(s, /(\d+(?:\.\d+)?|\.\d+)\s*acres?\b/i); s = t.rest;
  if (t.m) put("acres", num(t.m[1]));

  // price: after "sold for / price", else a dollar amount
  const scaled = (n: string, unit?: string) => Math.round(num(n) * (/^(?:k|thousand)$/i.test(unit ?? "") ? 1e3 : /^(?:m|million)$/i.test(unit ?? "") ? 1e6 : 1));
  t = takeFirst(s, /\b(?:sold|selling|sale|closed|price|priced|went)\s*(?:for|at|price|of)?\s*(?:of\s*)?\$?\s*(\d+(?:\.\d+)?)\s*(k|thousand|million|m)?\b/i);
  if (!t.m) t = takeFirst(s, /\$\s*(\d+(?:\.\d+)?)\s*(k|thousand|million|m)?\b/i);
  if (!t.m) t = takeFirst(s, /\b(\d+(?:\.\d+)?)\s*(k|thousand|million)?\s*(?:dollars|bucks)\b/i);
  s = t.rest;
  if (t.m) { const v = scaled(t.m[1], t.m[2]); if (v > 0) put("salePrice", v); }

  t = takeFirst(s, /(\d+(?:\.\d+)?)\s*[- ]?(?:bed(?:room)?s?|br|bd)\b/i); s = t.rest;
  if (t.m) put("beds", num(t.m[1]));
  t = takeFirst(s, /(\d+(?:\.\d+)?)\s*[- ]?(?:bath(?:room)?s?|ba)\b/i); s = t.rest;
  if (t.m) put("baths", num(t.m[1]));

  t = takeFirst(s, /\b(?:built(?:\s+in|\s+around|\s+circa)?|year\s+built(?:\s+is)?|constructed(?:\s+in)?)\s*(\d{4})\b/i);
  if (!t.m) t = takeFirst(s, /\b(\d{4})\s*(?:build|construction)\b/i);
  s = t.rest;
  if (t.m && +t.m[1] >= 1700 && +t.m[1] <= (opts.today ?? new Date()).getUTCFullYear() + 3) put("yearBuilt", +t.m[1]);

  t = takeFirst(s, /(\d+)(?:st|nd|rd|th)?\s*floor\b/i);
  if (!t.m) t = takeFirst(s, /\bfloor\s*(?:number\s*)?(\d+)\b/i);
  s = t.rest;
  if (t.m) put("floor", +t.m[1]);

  t = takeFirst(s, /\bno\s+parking\b/i);
  if (t.m) { put("parking", 0); s = t.rest; }
  else {
    t = takeFirst(s, /(\d+)\s*[- ]?(?:car\s+)?(?:parking(?:\s+(?:spaces?|spots?))?|garage(?:\s+(?:spaces?|spots?))?|spaces?|spots?)\b/i); s = t.rest;
    if (t.m) put("parking", +t.m[1]);
  }

  // what applies to this property type; the rest is reported, not used
  const applies: Record<PropertyKind, FieldName[]> = {
    home: ["address", "salePrice", "saleDate", "sqft", "beds", "baths", "yearBuilt", "distanceMi", "source"],
    apartment: ["address", "salePrice", "saleDate", "sqft", "beds", "baths", "yearBuilt", "floor", "parking", "monthlyFee", "distanceMi", "source"],
    condo: ["address", "salePrice", "saleDate", "sqft", "beds", "baths", "yearBuilt", "floor", "parking", "monthlyFee", "distanceMi", "source"],
    estate: ["address", "salePrice", "saleDate", "sqft", "acres", "beds", "baths", "yearBuilt", "distanceMi", "source"],
    land: ["address", "salePrice", "saleDate", "sqft", "distanceMi", "source"],
  };
  // for land, the size is acres: "4 acres" fills the size box, and a square-feet figure is not used
  const forcedIgnored: FieldName[] = [];
  if (kind === "land") {
    if (seen.has("acres")) { f.sqft = f.acres; delete f.acres; seen.delete("acres"); seen.add("sqft"); }
    else if (seen.has("sqft")) { delete f.sqft; seen.delete("sqft"); forcedIgnored.push("sqft"); }
  }
  // a chunk where only an "address" was found, and it doesn't look like one, is just talk
  if (seen.size === 1 && seen.has("address") && !/\d/.test(f.address ?? "") && !STREET_WORD.test(f.address ?? "")) { seen.delete("address"); delete f.address; }
  const found: FieldName[] = [], ignored: FieldName[] = [];
  for (const k of ORDER) {
    if (!seen.has(k)) continue;
    if (applies[kind].includes(k)) found.push(k); else { ignored.push(k); delete f[k]; }
  }
  return { fields: f, found, ignored: [...ignored, ...forcedIgnored] };
}

/** Split what was said into one piece per comp: new lines, "next comp", "another comp", "comp 2". */
export function splitComps(input: string): string[] {
  return input
    .split(/\r?\n+|\b(?:next|another|new)\s+(?:comp(?:arable)?|sale|one)\b[\s:,.-]*|\bcomp(?:arable)?\s+(?:number\s+)?(?:\d+|two|three|four|five|six|seven|eight|nine|ten)\b[\s:,.-]*/gi)
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** Read everything that was typed or said. Pieces with nothing recognisable are left out. */
export function parseComps(input: string, opts: ParseOptions = {}): ParsedComp[] {
  // a spoken or typed comp is a sentence or two; anything far longer is not one, and is cut so a huge paste can't stall the page
  return splitComps(input.slice(0, MAX_INPUT)).map((c) => parseComp(c, opts)).filter((p) => p.found.length > 0 || p.ignored.length > 0);
}
