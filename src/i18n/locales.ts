export interface LocaleInfo {
  /** Our code; also the file name in ./locales */
  code: string;
  /** The language's own name, shown in the picker */
  name: string;
  /** BCP-47 tag used for number, date and plural rules */
  intl: string;
  dir: "ltr" | "rtl";
}

/** Languages with a full translation. English is the source; the others are checked against it. */
export const LOCALES: LocaleInfo[] = [
  { code: "en", name: "English", intl: "en", dir: "ltr" },
  { code: "es", name: "Español", intl: "es", dir: "ltr" },
  { code: "fr", name: "Français", intl: "fr", dir: "ltr" },
  { code: "de", name: "Deutsch", intl: "de", dir: "ltr" },
  { code: "pt", name: "Português (Brasil)", intl: "pt-BR", dir: "ltr" },
  { code: "it", name: "Italiano", intl: "it", dir: "ltr" },
  { code: "nl", name: "Nederlands", intl: "nl", dir: "ltr" },
  { code: "pl", name: "Polski", intl: "pl", dir: "ltr" },
  { code: "ru", name: "Русский", intl: "ru", dir: "ltr" },
  { code: "uk", name: "Українська", intl: "uk", dir: "ltr" },
  { code: "tr", name: "Türkçe", intl: "tr", dir: "ltr" },
  { code: "ar", name: "العربية", intl: "ar", dir: "rtl" },
  { code: "he", name: "עברית", intl: "he", dir: "rtl" },
  { code: "fa", name: "فارسی", intl: "fa", dir: "rtl" },
  { code: "ur", name: "اردو", intl: "ur", dir: "rtl" },
  { code: "hi", name: "हिन्दी", intl: "hi", dir: "ltr" },
  { code: "bn", name: "বাংলা", intl: "bn", dir: "ltr" },
  { code: "zh-CN", name: "简体中文", intl: "zh-CN", dir: "ltr" },
  { code: "zh-TW", name: "繁體中文", intl: "zh-TW", dir: "ltr" },
  { code: "ja", name: "日本語", intl: "ja", dir: "ltr" },
  { code: "ko", name: "한국어", intl: "ko", dir: "ltr" },
  { code: "vi", name: "Tiếng Việt", intl: "vi", dir: "ltr" },
  { code: "th", name: "ไทย", intl: "th", dir: "ltr" },
  { code: "id", name: "Bahasa Indonesia", intl: "id", dir: "ltr" },
  { code: "ms", name: "Bahasa Melayu", intl: "ms", dir: "ltr" },
  { code: "fil", name: "Filipino", intl: "fil", dir: "ltr" },
  { code: "sw", name: "Kiswahili", intl: "sw", dir: "ltr" },
  { code: "el", name: "Ελληνικά", intl: "el", dir: "ltr" },
  { code: "cs", name: "Čeština", intl: "cs", dir: "ltr" },
  { code: "sv", name: "Svenska", intl: "sv", dir: "ltr" },
  { code: "ro", name: "Română", intl: "ro", dir: "ltr" },
  { code: "hu", name: "Magyar", intl: "hu", dir: "ltr" },
];

export const DEFAULT_LOCALE = "en";
export const isLocale = (code: string | null | undefined): code is string => !!code && LOCALES.some((l) => l.code === code);
export const localeInfo = (code: string): LocaleInfo => LOCALES.find((l) => l.code === code) ?? LOCALES[0];

/** Old or regional language tags browsers still report. */
const ALIASES: Record<string, string> = { iw: "he", in: "id", tl: "fil", nb: "sv", nn: "sv", no: "sv" };

/** Pick the best supported language for the browser's ordered list of preferences. */
export function matchLocale(tags: readonly string[] | undefined): string {
  for (const raw of tags ?? []) {
    const tag = raw.replace("_", "-").toLowerCase();
    const [lang, ...rest] = tag.split("-");
    if (!lang) continue;
    if (lang === "zh") {
      const traditional = rest.includes("hant") || rest.some((r) => ["tw", "hk", "mo"].includes(r));
      return traditional ? "zh-TW" : "zh-CN";
    }
    const base = ALIASES[lang] ?? lang;
    // no/nb/nn are only a rough match for Swedish: skip them so they fall through to a later preference
    if (["nb", "nn", "no"].includes(lang)) continue;
    const hit = LOCALES.find((l) => l.code.toLowerCase() === base);
    if (hit) return hit.code;
  }
  return DEFAULT_LOCALE;
}
