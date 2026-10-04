"use client";
import { useI18n } from "@/i18n";
import { useEntitlements } from "@/billing/entitlements";

const PIN = "M256 66c-92 0-162 68-162 154 0 112 162 232 162 232s162-120 162-232c0-86-70-154-162-154Z";

function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden>
        <defs>
          <linearGradient id="lm-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#16204a" /><stop offset="1" stopColor="#070b1c" /></linearGradient>
          <linearGradient id="lm-metal" x1=".1" y1="0" x2=".9" y2="1">
            <stop offset="0" stopColor="#fff1c7" /><stop offset=".28" stopColor="#f0cf7e" /><stop offset=".55" stopColor="#c9973f" /><stop offset=".8" stopColor="#e9c46a" /><stop offset="1" stopColor="#9c6f24" />
          </linearGradient>
          <linearGradient id="lm-shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".5" /><stop offset=".42" stopColor="#fff" stopOpacity="0" /></linearGradient>
        </defs>
        <rect width="512" height="512" rx="115" fill="url(#lm-bg)" />
        <path d={PIN} fill="url(#lm-metal)" />
        <path d={PIN} fill="url(#lm-shine)" />
        <path d="M256 112 372 214H350V330H162V214H140Z" fill="#070b1c" stroke="#070b1c" strokeWidth="10" strokeLinejoin="round" />
        <g fill="none" stroke="#fff1c7" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
          <path d="M202 214 256 160 310 214" />
          <path d="M222 242 256 208 290 242" opacity=".5" />
        </g>
        <path d="M256 252 296 322 256 304 216 322Z" fill="url(#lm-metal)" />
      </svg>
      <span className="hidden text-lg font-bold tracking-tight min-[480px]:inline" translate="no">CompPilot</span>
    </span>
  );
}

export default function Header() {
  const { t, locale, locales, setLocale } = useI18n();
  const ent = useEntitlements();
  return (
    <header className="no-print safe-top sticky top-0 z-10 border-b backdrop-blur" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 80%, transparent)" }}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
        <a href="/" aria-label="CompPilot"><Logo /></a>
        <div className="flex min-w-0 items-center gap-2">
          <label className="relative flex min-w-0 items-center">
            <span className="sr-only">{t("lang.label")}</span>
            <span aria-hidden className="pointer-events-none absolute start-3 text-sm">🌐</span>
            <select
              className="input !mt-0 !w-auto max-w-[8.5rem] cursor-pointer !py-2 !ps-9 text-sm font-semibold sm:max-w-none"
              value={locale}
              onChange={(e) => setLocale(e.target.value)}
              translate="no"
            >
              {locales.map((l) => (
                <option key={l.code} value={l.code} lang={l.intl} dir={l.dir}>{l.name}</option>
              ))}
            </select>
          </label>
          {ent.billingEnabled && (
            <>
              <a href="/pricing" className="btn !px-3 hidden sm:inline-flex">{t("nav.pricing")}</a>
              {!ent.loading && (
                <a
                  href="/pricing"
                  className="hidden rounded-full px-3 py-1 text-xs font-semibold md:inline-block"
                  style={{ background: "var(--surface-2)", color: "var(--accent)" }}
                  aria-label={t("billing.yourPlan", { plan: t(`plan.${ent.planId}.name`) })}
                  data-testid="plan-badge"
                >
                  {t(`plan.${ent.planId}.name`)}{ent.subscription?.status === "trialing" && ` · ${t("billing.trialBadge")}`}
                </a>
              )}
            </>
          )}
          <a href="/login" className="btn !px-3">{t("app.account")}</a>
        </div>
      </div>
    </header>
  );
}
