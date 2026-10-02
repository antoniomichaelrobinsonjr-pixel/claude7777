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

## Not yet built (later phases in the plan)
Maps/geocoding, server-rendered branded PDFs, Stripe billing, CSV import, comp-data APIs, teams.

Reports are comparative market analyses, not appraisals.
