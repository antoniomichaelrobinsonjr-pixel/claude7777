import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatNum, n, normalizeDigits, readMoney, separators, showMoney, translate, usdIn } from "./format.ts";

const plain = (s: string) => s.replace(/[\u2068\u2069]/g, "");
const en = { "a": "Hello {name}", "c.one": "{count} comp", "c.other": "{count} comps", "only.en": "English only" };
const ru = { "a": "Привет, {name}", "c.one": "{count} объект", "c.few": "{count} объекта", "c.many": "{count} объектов", "c.other": "{count} объекта" };

test("translate: placeholders, fallback to English, then to the key", () => {
  assert.equal(plain(translate({}, en, "en", "a", { name: "Ana" })), "Hello Ana");
  assert.equal(plain(translate(ru, en, "ru", "a", { name: "Ана" })), "Привет, Ана");
  assert.equal(translate(ru, en, "ru", "only.en"), "English only");
  assert.equal(translate(ru, en, "ru", "missing.key"), "missing.key");
});

test("translate: plural forms follow the language's own rules", () => {
  const f = (cnt: number) => plain(translate(ru, en, "ru", "c", { count: cnt }));
  assert.equal(f(1), "1 объект");
  assert.equal(f(2), "2 объекта");
  assert.equal(f(5), "5 объектов");
  assert.equal(f(21), "21 объект");
  assert.equal(plain(translate({}, en, "en", "c", { count: 1 })), "1 comp");
  assert.equal(plain(translate({}, en, "en", "c", { count: 3 })), "3 comps");
});

test("translate: a language with no plural split uses .other; missing category falls back to .other", () => {
  const ja = { "c.other": "{count}件" };
  assert.equal(plain(translate(ja, en, "ja", "c", { count: 1 })), "1件");
  assert.equal(plain(translate({ "c.other": "X{count}" }, en, "ru", "c", { count: 5 })), "X5");
});

test("formatting: currency, decimals and percent follow the locale; digits stay 0-9", () => {
  assert.equal(usdIn("en", 417297), "$417,297");
  assert.equal(usdIn("de", 417297).replace(/\s/g, " "), "417.297 $");
  assert.equal(formatNum("de", n.dec1(0.5)), "0,5");
  assert.equal(formatNum("ar", n.int(1234)), "1,234");
  assert.ok(/^[0-9.,%\u200e\u200f\u066a]+$/.test(formatNum("ar", n.pct1(12.5))), JSON.stringify(formatNum("ar", n.pct1(12.5))));
  assert.ok(!/[٠-٩]/.test(formatNum("ar", n.int(2026))), "Arabic locale must still use Western digits");
  assert.equal(formatNum("en", n.pct1(12.34)), "12.3%");
});

test("dollar amounts always use the plain $ sign, even where locales usually say US$", () => {
  for (const loc of ["en", "ar", "es", "fr", "pt-BR", "zh-CN", "ja", "hi", "he"]) assert.ok(usdIn(loc, 1234).includes("$") && !usdIn(loc, 1234).includes("US"), `${loc}: ${usdIn(loc, 1234)}`);
});

test("separators per locale", () => {
  assert.deepEqual(separators("en"), { decimal: ".", group: "," });
  assert.equal(separators("de").decimal, ",");
  assert.equal(separators("de").group, ".");
  assert.equal(separators("fr").decimal, ",");
});

test("typed prices: the same keystrokes mean different things in different locales", () => {
  assert.equal(readMoney("412.000", "de").value, 412000);   // German: dot groups thousands
  assert.equal(readMoney("412.000", "en").value, 412);      // English: dot is the decimal point
  assert.equal(readMoney("1.234,5", "de").value, 1234.5);
  assert.equal(readMoney("1,234.50", "en").value, 1234.5);
  assert.equal(readMoney("412000", "en").text, "412,000");
  assert.equal(readMoney("412000", "de").text, "412.000");
  assert.equal(readMoney("12,3456", "de").value, 12.34);    // at most two decimals
});

test("typed prices: other numeral systems, negatives, empty and junk", () => {
  assert.equal(normalizeDigits("٤١٢٠٠٠"), "412000");
  assert.equal(normalizeDigits("४१२०००"), "412000");
  assert.equal(readMoney("٤١٢٠٠٠", "ar").value, 412000);
  assert.equal(readMoney("৪১২০০০", "bn").value, 412000);
  assert.equal(readMoney("-12500", "en", true).value, -12500);
  assert.equal(readMoney("-12500", "en", false).value, 12500);
  assert.equal(readMoney("", "en").value, 0);
  assert.equal(readMoney("abc", "en").text, "");
  assert.equal(readMoney("-", "en", true).text, "-0");
  assert.equal(readMoney("0.", "en").text, "0.");
});

test("showMoney: empty for zero, localized otherwise", () => {
  assert.equal(showMoney(0, "en"), "");
  assert.equal(showMoney(412000, "en"), "412,000");
  assert.equal(showMoney(1234.5, "de"), "1.234,5");
});

test("inserted text values are bidi-isolated so mixed-direction sentences stay readable", () => {
  const out = translate({}, { k: "Matched: {label}" }, "ar", "k", { label: "12 Maple St" });
  assert.equal(out, "Matched: \u206812 Maple St\u2069");
  assert.equal(translate({}, { k: "{n} items" }, "en", "k", { n: 5 }), "5 items"); // plain numbers are not wrapped
});

test("dates use the Gregorian calendar and Western digits in every locale", () => {
  const d = new Date(Date.UTC(2026, 9, 4, 12));
  for (const loc of ["th", "fa", "ar", "he", "ja", "hi", "en"]) {
    const out = formatDate(loc, d, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
    assert.ok(out.includes("2026"), `${loc}: ${out}`);
    assert.ok(!/[\u0660-\u0669\u06f0-\u06f9\u0966-\u096f\u0e50-\u0e59]/.test(out), `${loc}: ${out}`);
  }
});
