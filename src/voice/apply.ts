import type { Comp } from "../lib/comps.ts";
import type { ParsedComp } from "./parse.ts";

const isBlank = (c: Comp) => !c.address.trim() && !(c.salePrice > 0) && !(c.sqft > 0) && !c.saleDate;

export interface ApplyResult { comps: Comp[]; added: number; skipped: number }

/**
 * Put read-in comps into a project. Empty placeholder comps are filled first so a new analysis doesn't end up with blank
 * rows next to the real ones; the rest are appended. `room` is how many comps the plan still allows in total (Infinity when
 * unlimited), counting the blanks that get filled. Nothing is overwritten and nothing is added past the limit.
 */
export function applyParsedComps(existing: Comp[], parsed: ParsedComp[], makeComp: () => Comp, room: number): ApplyResult {
  const comps = existing.map((c) => ({ ...c }));
  let added = 0, skipped = 0;
  for (const p of parsed) {
    const blank = comps.find((c) => isBlank(c));
    const target = blank ?? (comps.length < room ? makeComp() : null);
    if (!target) { skipped++; continue; }
    Object.assign(target, p.fields, { included: true });
    if (!blank) comps.push(target);
    added++;
  }
  return { comps, added, skipped };
}
