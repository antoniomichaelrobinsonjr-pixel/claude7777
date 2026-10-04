"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en } from "./en";
import { loaders } from "./loaders";
import { DEFAULT_LOCALE, LOCALES, isLocale, localeInfo, matchLocale, type LocaleInfo } from "./locales";
import { formatDate, formatNum, resolveMsg, translate, usdIn, type Dict, type Msg, type Num, type Vars } from "./format";
import { splitTags } from "./rich";

const STORAGE_KEY = "comppilot.locale";

type TagRenderers = Record<string, (children: string, key: number) => ReactNode>;

export interface I18n {
  locale: string;
  info: LocaleInfo;
  locales: LocaleInfo[];
  setLocale: (code: string) => void;
  /** Translate a key (picks the plural form when vars.count is given). */
  t: (key: string, vars?: Vars) => string;
  /** Translate a message object produced by the report logic. */
  tm: (m: Msg) => string;
  /** Translate a sentence containing <b>/<i>/<c>/<e> runs into React nodes. */
  rich: (key: string, vars?: Vars, tags?: TagRenderers) => ReactNode[];
  usd: (v: number) => string;
  num: (x: Num) => string;
  date: (d: Date | number, opts?: Intl.DateTimeFormatOptions) => string;
}

function build(locale: string, messages: Dict, setLocale: (c: string) => void): I18n {
  const info = localeInfo(locale);
  const t = (key: string, vars?: Vars) => translate(messages, en, info.intl, key, vars);
  return {
    locale, info, locales: LOCALES, setLocale, t,
    tm: (m) => resolveMsg(m, messages, en, info.intl),
    rich: (key, vars, tags = {}) => splitTags(t(key, vars)).map((seg, i) => (seg.tag && tags[seg.tag] ? tags[seg.tag](seg.text, i) : seg.text)),
    usd: (v) => usdIn(info.intl, v),
    num: (x) => formatNum(info.intl, x),
    date: (d, opts) => formatDate(info.intl, d, opts),
  };
}

const Ctx = createContext<I18n>(build(DEFAULT_LOCALE, {}, () => {}));
export const useI18n = () => useContext(Ctx);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);
  const [messages, setMessages] = useState<Dict>({});

  // Saved choice first, then the browser's language list, then English.
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* storage may be unavailable */ }
    setLocaleState(isLocale(saved) ? saved : matchLocale(navigator.languages?.length ? navigator.languages : [navigator.language]));
  }, []);

  useEffect(() => {
    const info = localeInfo(locale);
    document.documentElement.lang = info.intl;
    document.documentElement.dir = info.dir;
    if (locale === DEFAULT_LOCALE || !loaders[locale]) { setMessages({}); return; }
    let cancelled = false;
    loaders[locale]().then((m) => { if (!cancelled) setMessages(m.default); }).catch(() => { if (!cancelled) setMessages({}); });
    return () => { cancelled = true; };
  }, [locale]);

  const setLocale = useCallback((code: string) => {
    if (!isLocale(code)) return;
    setLocaleState(code);
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
  }, []);

  const value = useMemo(() => build(locale, messages, setLocale), [locale, messages, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
