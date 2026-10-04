# CompPilot

Guided comparable-sales market analysis (Next.js + Tailwind + optional Supabase). Built from the CompPilot Build Plan, Phase 1.

## Run
```
npm install
npm run dev      # http://localhost:3000
npm test
```

## Accounts and cloud saving (optional)
1. Create a Supabase project and run `supabase/schema.sql`.
2. Copy `.env.example` to `.env.local` and fill in the URL and anon key.

Without these, the app runs in local mode and saves analyses in the browser.

## Investor report
Each analysis has an **Investor report** page (`/project/[id]/report`): the indicated value and range, a reliability grade computed from five checks (number of comps, recency, proximity, adjustment size, agreement between adjusted prices), a per-comp evidence table with sources, the method and rates used, and an automatic list of assumptions and limitations. The grade is capped when the adjustment rates are the placeholder defaults with no stated basis, or when fewer than three comps are used. See `src/lib/report.ts`.

## Map and address lookup
On an analysis, **Locate addresses** sends the subject and comp addresses (only when you click, after a confirmation) to a geocoder and saves the coordinates plus the address it matched. Distances are then measured from the map, without overwriting any you typed. The investor report shows a map, flags any typed distance that disagrees with the map by more than 0.25 mi, and ignores a saved location if the address is edited afterwards.

By default this uses OpenStreetMap's public Nominatim geocoder and tiles, which are free and need no key but are intended for light use (about one request per second; see their usage policies). For production set `NEXT_PUBLIC_GEOCODER_URL` (a Nominatim-compatible `/search` endpoint) and `NEXT_PUBLIC_TILE_URL` / `NEXT_PUBLIC_TILE_ATTRIBUTION` in `.env.local`.

## Languages
The interface is available in 32 languages (picker in the header; the browser's language is detected on first visit and the choice is remembered). Arabic, Hebrew, Persian and Urdu switch the layout to right-to-left. Numbers and dates are formatted for the chosen language; prices always use Western digits (0-9) and US dollars, and measurements stay in square feet and miles. In price fields the language's own separators apply, so `412.000` is four hundred twelve thousand in German but 412 in English.

**Translation quality:** the translations were produced by AI and checked mechanically (every key present, placeholders and markup preserved, correct plural forms per language, no untranslated copies), but they have **not been reviewed by native speakers**. Have a professional review them before relying on them with customers or investors, especially the report's disclaimer and limitations wording.

Other languages: browsers' built-in page translation still works because every page declares its language.

**Adding or changing a language**
1. English is the source: `src/i18n/en.ts`. Edit wording there first.
2. To add a language, add it to `LOCALES` in `src/i18n/locales.ts` (code, native name, BCP-47 tag, direction), add a loader line in `src/i18n/loaders.ts`, and create `src/i18n/locales/<code>.ts` with every key.
3. Plural keys end in `.one`/`.other` (and `.few`, `.many`, `.two`, `.zero` where the language needs them). `npm test` fails with a precise list until a language file is complete and well-formed.

## Membership (Free / Plus / Pro / Studio)

Four tiers, billed weekly, monthly or yearly. **Billing is off by default**: until you enable it, every feature is unlocked and nothing is limited. All limits and prices live in `src/billing/plans.ts`, which drives the gating, the pricing page and the tests. Comps beyond a plan's limit are held back, never deleted, and limitations and disclaimers are never gated.

To switch it on:

1. Use Supabase with auth, then run `supabase/billing.sql` after `supabase/schema.sql`. It adds `profiles` and a trigger that enforces the limits in the database.
2. In Stripe, create a product per paid plan with weekly, monthly and yearly recurring prices. Put the nine price ids in the `STRIPE_PRICE_<PLAN>_<INTERVAL>` variables.
3. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (server only) and `NEXT_PUBLIC_SITE_URL`.
4. Add a Stripe webhook to `/api/billing/webhook` for `customer.subscription.created/updated/deleted` and `checkout.session.completed`. Configure the Stripe customer portal.
5. Set `NEXT_PUBLIC_BILLING_ENABLED=true`.

**Free trials.** Every paid plan (Plus, Pro, Studio) starts with a 7-day free trial, once per plan per account, so people can see what each tier does with their own comps. Checkout always collects a card and Stripe charges it when the trial ends unless the person cancels first (a trial with no card is cancelled by Stripe instead). Eligibility is decided on the server from `profiles.trials_used`, which only the webhook writes, so the request cannot grant or skip a trial, and cancelling does not give a trial back. The length is `TRIAL_DAYS` in `src/billing/plans.ts`; the translated wording says "7" outright, so change the strings too if you change the number.

`NEXT_PUBLIC_BILLING_PREVIEW=1` lets anyone pick a plan on `/pricing` for demos. Never set it in production.

Checkout, webhook and database rules are tested offline (fake Stripe events, real Postgres via PGlite). They have not been run against live Stripe.

## Daily market updates

Plus and above (open to everyone while billing is off). Pick the property's country on the analysis and CompPilot shows how home prices in that country have moved over the last year, a small trend line, and how far the market has moved since each comp sold. It is context only: it never changes the value, and the panel says so.

- **Source:** the Bank for International Settlements residential property price statistics (nominal index, quarterly, about sixty countries). Countries the BIS does not publish show "no market data yet". Nothing is estimated or invented.
- **"Daily" means the check is daily.** The BIS publishes new figures quarterly, so the numbers change when a new quarter is released; the panel shows when it was last checked and the latest quarter.
- **Setup:** run `supabase/market.sql`; set `CRON_SECRET`; have a scheduler call `GET /api/cron/market` daily with `Authorization: Bearer $CRON_SECRET`. `.github/workflows/market-refresh.yml` does this (add `MARKET_CRON_URL` and `CRON_SECRET` as repository secrets), or use Vercel Cron. The job saves nothing unless the whole download looks sane, so a bad day at the source leaves the previous data in place.
- **Not yet verified against the live BIS service.** The download and parser are tested on sample files written from the BIS documentation, but this build environment cannot reach stats.bis.org. Run the endpoint once after deploying and check the response; if the BIS has changed its address, set `MARKET_BIS_URL`.

## Not yet built (later phases in the plan)
Server-rendered branded PDFs, Stripe billing, CSV import, comp-data APIs, teams.

Reports are comparative market analyses, not appraisals.
