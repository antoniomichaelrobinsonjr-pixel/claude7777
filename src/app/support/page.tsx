import type { Metadata } from "next";

export const metadata: Metadata = { title: "Support – CompPilot" };

const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "[Set NEXT_PUBLIC_SUPPORT_EMAIL]";

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-2 p-6">
      <h2 className="display text-lg font-semibold">{q}</h2>
      {children}
    </section>
  );
}

/** Help page for the stores and for people. English only; keep it in step with how the app actually works. */
export default function Support() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 text-sm leading-6">
      <header>
        <h1 className="display text-3xl font-bold">Support</h1>
        <p className="muted mt-1">Write to <a className="underline" href={`mailto:${email}`}>{email}</a> and include the email you signed up with. This page is in English.</p>
      </header>

      <Q q="Is CompPilot an appraisal?">
        <p>No. It is a comparative market analysis built from the sales and rates you enter. It is for discussion and is not an appraisal or valuation for lending. A licensed appraiser is the right person for a formal appraisal.</p>
      </Q>

      <Q q="How do I cancel my plan?">
        <p>If you subscribed on the web: sign in, open Pricing, and choose Manage billing. You keep your plan until the end of the period you paid for. If you subscribed through the App Store or Google Play, cancel in your Apple or Google subscription settings.</p>
      </Q>

      <Q q="How do I delete my account and data?">
        <p>Sign in, open Account, and choose Delete account. This permanently deletes your account and its saved analyses and cancels any plan bought on the web. Analyses saved only on your device are removed by clearing the site or app data.</p>
      </Q>

      <Q q="Why can't I print or save a PDF?">
        <p>Printing and PDF export come with the paid plans. Every paid plan starts with a free 7-day trial.</p>
      </Q>

      <Q q="Why is there no market data for my country?">
        <p>The market figures come from a public source that covers a limited set of countries and publishes new figures quarterly. Where there is no data we say so rather than estimate.</p>
      </Q>

      <Q q="Where is my data stored?">
        <p>On your device unless you sign in to an account, in which case your analyses are also stored with our database provider. See the Privacy page for details.</p>
      </Q>
    </article>
  );
}
