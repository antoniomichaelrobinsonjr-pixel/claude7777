// Usage: node --experimental-strip-types scripts/i18n-missing.ts <code> [<code> ...]
// Lists every key a language still needs, with the English source text and the plural form to write.
import { en } from "../src/i18n/en.ts";
import { LOCALES } from "../src/i18n/locales.ts";

const SUFFIX = /\.(zero|one|two|few|many|other)$/;
const baseOf = (k: string) => k.replace(SUFFIX, "");
const enBases = new Set(Object.keys(en).filter((k) => SUFFIX.test(k)).map(baseOf));

for (const code of process.argv.slice(2)) {
  const loc = LOCALES.find((l) => l.code === code);
  if (!loc) { console.log(`unknown language ${code}`); continue; }
  const dict: Record<string, string> = (await import(`../src/i18n/locales/${code}.ts`)).default;
  const pr = new Intl.PluralRules(loc.intl);
  const cats = new Set<string>();
  for (let i = 0; i <= 200; i++) cats.add(pr.select(i));
  const lines: string[] = [];
  for (const base of new Set(Object.keys(en).map(baseOf))) {
    if (enBases.has(base)) {
      for (const c of new Set([...cats, "other"])) {
        const key = `${base}.${c}`;
        if (!(key in dict)) lines.push(`${key}\t${en[key] ?? en[`${base}.other`]}`);
      }
    } else if (!(base in dict)) lines.push(`${base}\t${en[base]}`);
  }
  console.log(`# ${code} (${loc.name}) needs ${lines.length} keys`);
  for (const l of lines) console.log(l);
}
