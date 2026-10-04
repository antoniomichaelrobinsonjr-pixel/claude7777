import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { en } from "./en.ts";
import { LOCALES, matchLocale, localeInfo } from "./locales.ts";
import { splitTags } from "./rich.ts";

const ROOT = new URL("../..", import.meta.url).pathname;
const dir = (p: string) => join(ROOT, p);

// ---------- helpers ----------
const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const tagCounts = (s: string) => {
  const c: Record<string, number> = {};
  for (const m of s.matchAll(/<(\/?)(b|i|c|e)>/g)) c[m[1] + m[2]] = (c[m[1] + m[2]] ?? 0) + 1;
  return JSON.stringify(Object.entries(c).sort());
};
const PLURAL_SUFFIX = /\.(zero|one|two|few|many|other)$/;
const baseOf = (k: string) => k.replace(PLURAL_SUFFIX, "");
const enBases = new Set(Object.keys(en).filter((k) => PLURAL_SUFFIX.test(k)).map(baseOf));
const hasKey = (dict: Record<string, string>, key: string) => key in dict || `${key}.other` in dict;
const neededCategories = (intl: string) => {
  const pr = new Intl.PluralRules(intl);
  const cats = new Set<string>();
  for (let i = 0; i <= 200; i++) cats.add(pr.select(i));
  return cats;
};
const files = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

// ---------- English source is self-consistent ----------
test("english: every plural base has .other and non-empty strings", () => {
  for (const [k, v] of Object.entries(en)) assert.ok(v.trim().length > 0, `empty: ${k}`);
  for (const b of enBases) assert.ok(`${b}.other` in en, `missing ${b}.other`);
});

// ---------- the code only uses keys that exist ----------
test("every translation key referenced in the code exists in English", () => {
  const prefixes = new Set(Object.keys(en).map((k) => k.split(".")[0]));
  const used = new Map<string, string>();
  const src = files(dir("src")).filter((f) => /\.(ts|tsx)$/.test(f) && !/\/i18n\/(en|locales\/)/.test(f) && !/\.test\.ts$/.test(f));
  for (const f of src) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/["'`]([a-z][A-Za-z]*(?:\.[A-Za-z0-9_]+)+)["'`]/g)) {
      if (prefixes.has(m[1].split(".")[0])) used.set(m[1], f);
    }
  }
  const missing = [...used].filter(([k]) => !hasKey(en, k)).map(([k, f]) => `${k} (${f.replace(ROOT, "")})`);
  assert.deepEqual(missing, []);
  // keys built at run time
  for (const f of ["count", "recency", "proximity", "similarity", "consistency"]) for (const part of ["label", "rule"]) assert.ok(`factor.${f}.${part}` in en, `factor.${f}.${part}`);
  for (const g of ["High", "Moderate", "Limited", "Low"]) for (const p of ["grade", "verdict"]) assert.ok(`${p}.${g}` in en);
  for (const c of ["rate_limited", "http", "network", "cancelled"]) assert.ok(`geo.err.${c}` in en);
  for (const b of ["map", "mixed", "entered"]) assert.ok(`distance.basis.${b}` in en);
  for (const k of ["trend.flat", "trend.rising", "trend.falling", "geo.matched", "geo.matchedArea", "trend.note.tooFew", "trend.note.short", "trend.note.fit", "trend.note.fitNoR2"]) assert.ok(k in en, k);
});

// ---------- locale detection ----------
test("matchLocale: browser preferences map to supported languages", () => {
  assert.equal(matchLocale(["de-AT", "en"]), "de");
  assert.equal(matchLocale(["pt-PT"]), "pt");
  assert.equal(matchLocale(["zh-Hant-HK"]), "zh-TW");
  assert.equal(matchLocale(["zh-TW"]), "zh-TW");
  assert.equal(matchLocale(["zh-CN"]), "zh-CN");
  assert.equal(matchLocale(["zh"]), "zh-CN");
  assert.equal(matchLocale(["iw-IL"]), "he");
  assert.equal(matchLocale(["tl"]), "fil");
  assert.equal(matchLocale(["fil-PH"]), "fil");
  assert.equal(matchLocale(["nb-NO", "fr"]), "fr");     // Norwegian is not supported: next preference wins
  assert.equal(matchLocale(["xx-YY"]), "en");
  assert.equal(matchLocale(undefined), "en");
  assert.equal(matchLocale([]), "en");
});

test("locales: right-to-left set is correct and every language has a file", () => {
  assert.deepEqual(LOCALES.filter((l) => l.dir === "rtl").map((l) => l.code).sort(), ["ar", "fa", "he", "ur"]);
  assert.equal(new Set(LOCALES.map((l) => l.code)).size, LOCALES.length);
  for (const l of LOCALES) if (l.code !== "en") assert.ok(existsSync(dir(`src/i18n/locales/${l.code}.ts`)), `missing file for ${l.code}`);
  for (const l of LOCALES) assert.doesNotThrow(() => new Intl.PluralRules(l.intl));
  assert.equal(localeInfo("nope").code, "en");
});

test("splitTags only recognises whitelisted tags and never returns markup", () => {
  assert.deepEqual(splitTags("a <b>x</b> c"), [{ text: "a " }, { tag: "b", text: "x" }, { text: " c" }]);
  assert.deepEqual(splitTags("<img src=x onerror=1>"), [{ text: "<img src=x onerror=1>" }]);
  assert.deepEqual(splitTags("plain"), [{ text: "plain" }]);
});

// ---------- every translation ----------
for (const loc of LOCALES.filter((l) => l.code !== "en")) {
  test(`translation ${loc.code} (${loc.name}) is complete and well-formed`, async () => {
    const dict: Record<string, string> = (await import(`./locales/${loc.code}.ts`)).default;
    const problems: string[] = [];
    const cats = neededCategories(loc.intl);

    for (const base of new Set(Object.keys(en).map(baseOf))) {
      const isPlural = enBases.has(base);
      if (!isPlural) {
        if (!(base in dict)) { problems.push(`missing: ${base}`); continue; }
      } else {
        if (!(`${base}.other` in dict)) problems.push(`missing plural .other: ${base}`);
        for (const c of cats) if (c !== "other" && !(`${base}.${c}` in dict)) problems.push(`missing plural form .${c}: ${base}`);
      }
    }
    for (const [k, v] of Object.entries(dict)) {
      const enKey = k in en ? k : `${baseOf(k)}.other`;
      const ref = en[k] ?? en[enKey] ?? en[baseOf(k)];
      if (ref === undefined) { problems.push(`unknown key: ${k}`); continue; }
      if (!v.trim()) { problems.push(`empty: ${k}`); continue; }
      const isPluralKey = enBases.has(baseOf(k));
      // placeholders
      const want = new Set([...placeholders(ref)]);
      if (isPluralKey) for (const kk of Object.keys(en)) if (baseOf(kk) === baseOf(k)) for (const p of placeholders(en[kk])) want.add(p);
      const got = placeholders(v);
      for (const p of got) if (!want.has(p)) problems.push(`${k}: unexpected {${p}}`);
      for (const p of want) if (!got.has(p) && !(isPluralKey && p === "count")) problems.push(`${k}: missing {${p}}`);
      // tags
      if (tagCounts(v) !== tagCounts(ref)) problems.push(`${k}: tags differ from English`);
      if (/<(?!\/?(b|i|c|e)>)[a-z!\/]/i.test(v)) problems.push(`${k}: contains markup`);
      if (ref.includes("CompPilot") && !v.includes("CompPilot")) problems.push(`${k}: brand name missing`);
      if (ref.includes("\n") && !v.includes("\n")) problems.push(`${k}: line break missing`);
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)) problems.push(`${k}: control character`);
      if (v === ref && ref.length > 40) problems.push(`${k}: identical to English`);
    }
    assert.deepEqual(problems.slice(0, 25), [], `${problems.length} problem(s) in ${loc.code}`);
  });
}
