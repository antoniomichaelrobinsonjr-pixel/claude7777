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

## Not yet built (later phases in the plan)
Maps/geocoding, server-rendered branded PDFs, Stripe billing, CSV import, comp-data APIs, teams.

Reports are comparative market analyses, not appraisals.
