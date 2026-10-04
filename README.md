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

## Not yet built (later phases in the plan)
Server-rendered branded PDFs, Stripe billing, CSV import, comp-data APIs, teams.

Reports are comparative market analyses, not appraisals.
