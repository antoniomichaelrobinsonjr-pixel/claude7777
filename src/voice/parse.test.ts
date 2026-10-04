import { test } from "node:test";
import assert from "node:assert/strict";
import { parseComp, parseComps, splitComps, wordsToNumbers } from "./parse.ts";

const today = new Date("2026-10-04T12:00:00Z");
const home = (s: string, kind: "home" | "apartment" | "condo" | "estate" | "land" = "home", extra = {}) => parseComp(s, { kind, today, ...extra });

test("a full sentence in digits fills every field it names", () => {
  const r = home("48 Oak Avenue, sold for $412,000 on August 14, 1,790 square feet, 3 beds, 2 baths, built 1995, 0.3 miles away");
  assert.deepEqual(r.fields, { address: "48 Oak Avenue", salePrice: 412000, saleDate: "2026-08-14", sqft: 1790, beds: 3, baths: 2, yearBuilt: 1995, distanceMi: 0.3 });
  assert.deepEqual(r.found, ["address", "salePrice", "saleDate", "sqft", "beds", "baths", "yearBuilt", "distanceMi"]);
  assert.deepEqual(r.ignored, []);
});

test("spoken numbers, ordinals, halves and fractions of a mile", () => {
  const r = home("7 Birch Lane sold for four hundred thirty six thousand dollars on the second of April 2026, nineteen hundred twenty square feet, three bedrooms, two and a half baths, built in 1997, half a mile away, MLS number 55123");
  assert.equal(r.fields.address, "7 Birch Lane");
  assert.equal(r.fields.salePrice, 436000);
  assert.equal(r.fields.saleDate, "2026-04-02");
  assert.equal(r.fields.sqft, 1920);
  assert.equal(r.fields.beds, 3);
  assert.equal(r.fields.baths, 2.5);
  assert.equal(r.fields.yearBuilt, 1997);
  assert.equal(r.fields.distanceMi, 0.5);
  assert.equal(r.fields.source, "MLS #55123");
});

test("words to numbers", () => {
  const w = wordsToNumbers;
  assert.equal(w("four hundred twelve thousand and fifty"), "412050");
  assert.equal(w("one point five million"), "1500000");
  assert.equal(w("point three"), "0.3");
  assert.equal(w("two point five"), "2.5");
  assert.equal(w("a quarter mile"), "0.25 miles");
  assert.equal(w("three quarters of a mile"), "0.75 miles");
  assert.equal(w("half an acre"), "0.5 acres");
  assert.equal(w("twenty five hundred square feet"), "2500 square feet");
  assert.equal(w("a hundred thousand"), "100000");
  assert.equal(w("twenty-first of May"), "21st of May");
  assert.equal(w("4.2 million"), "4.2 million", "digits followed by a scale word are left for the price reader");
  assert.equal(w("412 thousand"), "412 thousand");
  assert.equal(w("on the fifth"), "on the 5th");
  assert.equal(w("no numbers here"), "no numbers here");
});

test("apartment and condo: floor, parking and the monthly fee", () => {
  for (const kind of ["apartment", "condo"] as const) {
    const r = home("Unit 12B Harbor Tower sold for 540k on 3/14/2026 1,000 sq ft 2 bed 1 bath 12th floor 2 parking spaces HOA fee of $500 a month", kind);
    assert.deepEqual(r.fields, { address: "Unit 12B Harbor Tower", salePrice: 540000, saleDate: "2026-03-14", sqft: 1000, beds: 2, baths: 1, floor: 12, parking: 2, monthlyFee: 500 });
    assert.deepEqual(r.ignored, []);
  }
});

test("the monthly fee is never mistaken for the sale price, in either order", () => {
  assert.deepEqual([home("HOA $500 a month, sold for $400,000", "apartment").fields.monthlyFee, home("HOA $500 a month, sold for $400,000", "apartment").fields.salePrice], [500, 400000]);
  assert.deepEqual([home("sold for $400,000 with a $450 monthly fee", "condo").fields.monthlyFee, home("sold for $400,000 with a $450 monthly fee", "condo").fields.salePrice], [450, 400000]);
  assert.equal(home("$380 a month association dues sold for $390,000", "condo").fields.salePrice, 390000);
});

test("estates read the grounds in acres; land reads acres as its size", () => {
  const e = home("Windward Estate sold for 4.2 million on January 5th 2026 9,000 square feet 6 beds 7 baths 6 acres built 2010 six miles away", "estate");
  assert.deepEqual(e.fields, { address: "Windward Estate", salePrice: 4200000, saleDate: "2026-01-05", sqft: 9000, acres: 6, beds: 6, baths: 7, yearBuilt: 2010, distanceMi: 6 });
  const l = home("Lot 4 Ridge Road sold for $125,000 on June 1 2026, four and a half acres", "land");
  assert.deepEqual(l.fields, { address: "Lot 4 Ridge Road", salePrice: 125000, saleDate: "2026-06-01", sqft: 4.5 });
  const ls = home("Lot 9 sold for $90,000 5,000 square feet", "land");
  assert.equal(ls.fields.sqft, undefined, "land is sized in acres, so square feet is not used");
  assert.deepEqual(ls.ignored, ["sqft"]);
});

test("details that don't apply to the property type are reported, not used", () => {
  const h = home("12 Elm St sold for $300,000 3 beds on the 5th floor with 2 parking spaces and a $300 monthly fee", "home");
  assert.deepEqual(h.ignored, ["floor", "parking", "monthlyFee"]);
  assert.equal(h.fields.floor, undefined);
  assert.equal(h.fields.beds, 3);
  const e = home("Manor sold for $3,000,000 on the 2nd floor 2 parking spaces 3 acres", "estate");
  assert.deepEqual(e.ignored, ["floor", "parking"]);
  assert.equal(e.fields.acres, 3);
  const a = home("Flat 3 sold for $200,000 2 acres", "apartment");
  assert.deepEqual(a.ignored, ["acres"]);
});

test("price forms", () => {
  const p = (s: string) => home(s).fields.salePrice;
  assert.equal(p("1 Main St sold for $412k"), 412000);
  assert.equal(p("1 Main St sold for 412 thousand dollars"), 412000);
  assert.equal(p("1 Main St sold at 412000"), 412000);
  assert.equal(p("1 Main St sold for $1.2 million"), 1200000);
  assert.equal(p("1 Main St sold for one point two million"), 1200000);
  assert.equal(p("1 Main St price $525,500"), 525500);
  assert.equal(p("1 Main St for four hundred and five thousand dollars"), 405000);
  assert.equal(p("1 Main St 3 beds 2 baths"), undefined, "no price said, none invented");
});

test("date forms, and the year when none is said", () => {
  const d = (s: string, o = {}) => home(`1 Main St ${s}`, "home", o).fields.saleDate;
  assert.equal(d("closed 2026-08-14"), "2026-08-14");
  assert.equal(d("sold 8/14/2026"), "2026-08-14");
  assert.equal(d("sold 14/8/2026", { dateOrder: "dmy" }), "2026-08-14");
  assert.equal(d("sold 14th of August"), "2026-08-14");
  assert.equal(d("sold on August 14"), "2026-08-14");
  assert.equal(d("sold on December 5"), "2025-12-05", "a date later than today means last year");
  assert.equal(d("sold on October 4"), "2026-10-04", "today is not in the future");
  assert.equal(d("sold in March 2026"), "2026-03-15", "only the month was said: the middle of it");
  assert.equal(d("sold on February 30"), undefined, "an impossible date is not guessed");
  assert.equal(d("sold 13/45/2026"), undefined);
  assert.equal(d("sold on august fourteenth"), "2026-08-14");
  assert.equal(d("sold on the 14th of August 2025"), "2025-08-14");
});

test("distance forms", () => {
  const m = (s: string) => home(`1 Main St ${s}`).fields.distanceMi;
  assert.equal(m("0.3 miles away"), 0.3);
  assert.equal(m(".3 mi"), 0.3);
  assert.equal(m("point three miles"), 0.3);
  assert.equal(m("a quarter mile away"), 0.25);
  assert.equal(m("three quarters of a mile"), 0.75);
  assert.equal(m("within 2 miles"), 2);
  assert.equal(m("1,790 square feet"), undefined);
});

test("bedrooms, bathrooms and year built", () => {
  const r = home("1 Main St 4-bedroom 2 and a half bath constructed in 1962");
  assert.deepEqual([r.fields.beds, r.fields.baths, r.fields.yearBuilt], [4, 2.5, 1962]);
  assert.equal(home("1 Main St built 3000").fields.yearBuilt, undefined, "a year far in the future is rejected");
  assert.equal(home("1 Main St 3br 2ba").fields.beds, 3);
  assert.equal(home("1 Main St 3br 2ba").fields.baths, 2);
});

test("the address is whatever comes before the first other detail, with its case kept", () => {
  assert.equal(home("Comp 1: 48 Oak Avenue, Test City, sold for $400,000").fields.address, "48 Oak Avenue, Test City");
  assert.equal(home("Fifth Avenue penthouse sold for $2,000,000", "apartment").fields.address, "Fifth Avenue penthouse");
  assert.equal(home("sold for $400,000 3 beds").fields.address, undefined, "no address said, none invented");
  assert.equal(home("123 Mile High Drive sold for $300,000").fields.address, "123 Mile High Drive");
  assert.equal(home("123 Mile High Drive sold for $300,000").fields.distanceMi, undefined, "an address is not a distance");
});

test("source", () => {
  assert.equal(home("1 Main St sold for $1 source county records, 3 beds").fields.source, "county records");
  assert.equal(home("1 Main St MLS #A12345").fields.source, "MLS #A12345");
});

test("several comps in one go: new lines, 'next comp', 'comp 2'", () => {
  assert.deepEqual(splitComps("48 Oak Avenue sold for $400,000\n7 Birch Lane sold for $420,000"), ["48 Oak Avenue sold for $400,000", "7 Birch Lane sold for $420,000"]);
  assert.deepEqual(splitComps("48 Oak sold $1. Next comp 7 Birch sold $2. Another comp 9 Pine sold $3"), ["48 Oak sold $1.", "7 Birch sold $2.", "9 Pine sold $3"]);
  assert.deepEqual(splitComps("Comp 1 48 Oak sold $1. Comp number 2 7 Birch sold $2"), ["48 Oak sold $1.", "7 Birch sold $2"]);
  const all = parseComps("48 Oak Avenue sold for $400,000, next comp, 7 Birch Lane sold for $420,000 3 beds", { kind: "home", today });
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((c) => c.fields.salePrice), [400000, 420000]);
  assert.equal(all[1].fields.beds, 3);
});

test("nothing recognisable gives nothing, never a made-up comp", () => {
  assert.deepEqual(parseComps("", { today }), []);
  assert.deepEqual(parseComps("   \n  ", { today }), []);
  assert.deepEqual(parseComps("hello there, how are you today", { today }), []);
  assert.deepEqual(parseComps("um okay let me think", { today }), []);
});

test("garbage that looks like markup is only ever text", () => {
  const r = home('<img src=x onerror=alert(1)> Rd sold for $100,000');
  assert.equal(r.fields.salePrice, 100000);
  assert.ok(typeof r.fields.address === "string");
});

test("it only reports what it found, in a steady order", () => {
  const r = home("3 beds 2 baths");
  assert.deepEqual(r.found, ["beds", "baths"]);
  assert.deepEqual(Object.keys(r.fields).sort(), ["baths", "beds"]);
});

test("it never throws and never takes long, whatever it is given", () => {
  const nasty = [
    "a ".repeat(5000), "one ".repeat(3000), "and ".repeat(3000), "point ".repeat(2000), "$".repeat(5000), "1".repeat(5000), "1,".repeat(3000),
    "of a ".repeat(2000) + "mile", "three quarters of a ".repeat(500) + "mile", "😀 ".repeat(2000), "\u0000\u0001\u0002", "<<<>>>&&&".repeat(500),
    "48 Oak Avenue sold for " + "nine hundred ".repeat(500) + "dollars", "Feb 30 ".repeat(1000), "1/1/1 ".repeat(1500), "bed ".repeat(3000),
  ];
  for (const n of nasty) {
    const t0 = Date.now();
    assert.doesNotThrow(() => parseComps(n, { today, kind: "apartment" }), n.slice(0, 20));
    assert.ok(Date.now() - t0 < 1500, `slow on ${JSON.stringify(n.slice(0, 20))}: ${Date.now() - t0}ms`);
  }
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const bits = ["sold", "for", "$", "412,000", "four", "hundred", "point", "three", "miles", "mi", "bed", "baths", "square feet", "built", "1995", "on", "August", "14th", "floor", "acre", "HOA", "fee", "a", "half", "and", "next comp", "\n", ",", ".", "MLS", "#12", "x"];
  for (let i = 0; i < 3000; i++) {
    const text = Array.from({ length: 1 + Math.floor(rnd() * 25) }, () => bits[Math.floor(rnd() * bits.length)]).join(" ");
    for (const kind of ["home", "apartment", "estate", "land"] as const) {
      const out = parseComps(text, { today, kind });
      for (const c of out) {
        for (const [k, v] of Object.entries(c.fields)) {
          assert.ok(v !== undefined && v !== null, `${k} is set to nothing for ${JSON.stringify(text)}`);
          if (typeof v === "number") assert.ok(Number.isFinite(v) && v >= 0, `${k}=${v} for ${JSON.stringify(text)}`);
        }
        assert.deepEqual([...c.found].sort(), Object.keys(c.fields).sort(), `found and fields disagree for ${JSON.stringify(text)}`);
        if (c.fields.saleDate) assert.match(c.fields.saleDate, /^\d{4}-\d{2}-\d{2}$/);
        if (c.fields.yearBuilt) assert.ok(c.fields.yearBuilt >= 1700 && c.fields.yearBuilt <= 2029);
      }
    }
  }
});
