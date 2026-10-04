import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, safeFileName, toCsv } from "./csv.ts";

test("plain values are written as they are", () => {
  assert.equal(csvCell("48 Oak Ave"), "48 Oak Ave");
  assert.equal(csvCell(412000), "412000");
  assert.equal(csvCell(0.3), "0.3");
  assert.equal(csvCell(-12500), "-12500");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
  assert.equal(csvCell(NaN), "");
  assert.equal(csvCell(true), "TRUE");
});

test("commas, quotes and line breaks are quoted and escaped", () => {
  assert.equal(csvCell("12 Maple St, Test City"), '"12 Maple St, Test City"');
  assert.equal(csvCell('He said "hi"'), '"He said ""hi"""');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell(" padded "), '" padded "');
});

test("formula injection is neutralised for text, but real negative numbers stay numeric", () => {
  for (const evil of ['=HYPERLINK("http://evil","click")', "+1+1", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
    const out = csvCell(evil);
    const inner = out.startsWith('"') ? out.slice(1) : out;
    assert.ok(inner.startsWith("'"), `${JSON.stringify(evil)} -> ${out}`);
  }
  assert.equal(csvCell(-5), "-5");
  assert.equal(csvCell("5-star"), "5-star");
});

test("rows get a BOM and Windows line endings; non-Latin text survives", () => {
  const csv = toCsv([["Адрес", "価格"], ["Maple St", 100]]);
  assert.ok(csv.startsWith("﻿"));
  assert.equal(csv, "﻿Адрес,価格\r\nMaple St,100\r\n");
});

test("file names are safe and never empty", () => {
  assert.equal(safeFileName("Maple Street valuation"), "Maple-Street-valuation");
  assert.equal(safeFileName("../../etc/passwd"), "etc-passwd");
  assert.equal(safeFileName("???"), "analysis");
  assert.equal(safeFileName("", "comps"), "comps");
  assert.equal(safeFileName("a".repeat(100)).length, 40);
  assert.ok(!/[\/\\:*?"<>|]/.test(safeFileName('x/y\\z:*?"<>|')));
});
