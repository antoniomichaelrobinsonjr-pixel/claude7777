/**
 * CSV for spreadsheets. Two things matter beyond quoting:
 *  - Formula injection: Excel and Sheets run a cell that starts with = + - @ (or a tab/return) as a formula. A comp's
 *    address or source is typed by a person, so a cell like =HYPERLINK(...) could do harm when someone else opens the
 *    file. Text cells that start with one of those characters get a leading apostrophe, which spreadsheets show as text.
 *  - Numbers stay numbers, in plain machine form (no thousands separators), so they sum and sort correctly everywhere.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  const text = FORMULA_START.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/** UTF-8 with a byte-order mark so Excel opens accented and non-Latin text correctly. */
export const toCsv = (rows: (string | number | boolean | null | undefined)[][]): string =>
  "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export function safeFileName(name: string, fallback = "analysis"): string {
  const base = name.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return base || fallback;
}
