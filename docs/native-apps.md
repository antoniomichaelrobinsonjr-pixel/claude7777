# Putting CompPilot in the App Store and Google Play

Status: the web app is ready to be wrapped; the store apps themselves have **not** been built or tested here (no Mac, Xcode or
Android SDK in this environment). This page says what is done, what is not, and what you have to decide.

## What is already in the repo

| Store requirement | Status |
| --- | --- |
| Privacy policy URL | `/privacy` (plain English, describes what the app really does). Set `NEXT_PUBLIC_OPERATOR_NAME` and `NEXT_PUBLIC_SUPPORT_EMAIL`, and have a lawyer review it. |
| Support URL | `/support` |
| In-app account deletion (Apple 5.1.1(v), Google Play) | Done: Account, then Delete account. Cancels a web subscription first and deletes nothing if cancelling fails (tested). |
| "Not an appraisal" disclaimer visible in the app | Done, on every analysis and report |
| No sign-in wall | Done: the free plan works without an account |
| Don't sell plans outside the store's payment system | Done for now: inside a store app (`window.Capacitor` native) the buy, trial and Manage billing buttons are hidden and a note says plans can't be bought in the app yet. Existing plans still work after sign-in. |
| Store screenshots and description | Mockups made; see the listing mockup images |
| Wrapper config | `capacitor.config.json` (placeholder app id and site URL) |

## Recommended approach

Use **Capacitor** to wrap the hosted site, and keep the server (Supabase, Stripe, the market job) exactly where it is.

1. Deploy the web app to HTTPS and set the site URL in `capacitor.config.json` (`server.url`). Replace the app id (`com.example.comppilot`) with yours; it can't be changed after release.
2. On a Mac: `npm i @capacitor/core @capacitor/ios @capacitor/android && npm i -D @capacitor/cli`, then `npx cap add ios`, `npx cap add android`, `npx cap sync`, and open the projects in Xcode and Android Studio.
3. Add the app icon and splash from `public/icon-512.png` (the artwork is in `src/app/icon.png` and the header logo).
4. Test on real devices, then archive and upload through App Store Connect and the Play Console.

**Review risk to plan for.** Apple (guideline 4.2) can reject an app that is only a website in a frame. CompPilot is a real tool (offline-capable guided flow, saved analyses, reports, PDF), which helps, but add at least one native touch before submitting (for example the native share sheet for reports, or Apple/Google in-app purchase below). The alternative is a static export bundled in the app; it needs the dynamic routes (`/project/[id]`) reworked into a single page with a query string and the API routes moved to a hosted server, a larger change that I'd only do if review pushes back.

For **Android** a Trusted Web Activity (via PWABuilder or Bubblewrap) is also an option: it wraps the installed PWA with no native code, and Play accepts it.

## Selling plans inside the apps (the part that needs decisions)

As far as I know, both stores require their own purchase system for subscriptions that unlock features inside the app (Apple in-app purchase and Google Play Billing, with a commission of up to 30%, 15% under their small-business programs). Rules differ by country and have been changing, so confirm the current guidelines before you commit. The safe plan:

**Phase 1 (what is built).** The app lets people sign in to a plan they bought on the web but doesn't sell plans or link to the web checkout.

**Phase 2 (not built).** Add store purchases:
- Create three subscription products in each store (Plus, Pro, Studio) with weekly, monthly and yearly options, mapped in the server by environment variables, the same way the Stripe prices are (`APPLE_PRODUCT_PRO_MONTH`, ...).
- Use a purchase plugin (RevenueCat, or the StoreKit/Play Billing plugins) in the app. Pass the Supabase user id as the account token so a purchase is tied to the account.
- Add a server endpoint that receives Apple's App Store Server Notifications and Google's Real-time developer notifications, verifies them with the stores' official libraries, and writes the same `profiles` row the Stripe webhook writes (plan, interval, status, period end), plus a `provider` column.
- Keep **one active subscription per person across Stripe, Apple and Google**: refuse a new checkout when another provider's subscription is active, as the Stripe route already does for Stripe.
- Account deletion must tell people that store subscriptions are cancelled in their Apple or Google settings (the privacy page already says so).

**Decisions you need to make for phase 2**
- *Trials.* Apple and Google run free trials as introductory offers, and Apple allows one per subscription group per Apple ID, not one per plan as on the web. If all plans sit in one group, a person gets one 7-day trial in the app, not one per tier.
- *Prices.* Store prices come from fixed price points, and the commission is taken from them. Decide whether in-app prices match the web or are higher.
- *Existing web subscribers.* They keep their plan in the app (built). Whether the app may mention that plans can be bought on the web depends on the country and the current rules.

## Before you submit

- Apple Developer Program (US$99 a year) and Google Play Console (one-off US$25).
- Fill the placeholders: app id, site URL, operator name, support email.
- A reviewer test account (email and password) with a Pro plan, given in the review notes, because reviewers can't buy anything.
- Privacy "nutrition label" and Play Data safety form. What the app collects: email address and the analyses a person saves (linked to the account); purchase history; no tracking, no ads, no analytics. Addresses typed into "locate addresses" go to the map provider (OpenStreetMap by default) only when the person uses that feature.
- Age rating (no objectionable content) and export compliance (HTTPS only, standard encryption).
- Native screenshots at the stores' required sizes (the listing mockups use the real screens at phone size).
