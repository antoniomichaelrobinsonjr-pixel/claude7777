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

## Not yet built (later phases in the plan)
Server-rendered branded PDFs, Stripe billing, CSV import, comp-data APIs, teams.

Reports are comparative market analyses, not appraisals.
