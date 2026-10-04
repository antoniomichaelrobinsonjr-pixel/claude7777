import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy – CompPilot" };

const operator = process.env.NEXT_PUBLIC_OPERATOR_NAME || "[Set NEXT_PUBLIC_OPERATOR_NAME]";
const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "[Set NEXT_PUBLIC_SUPPORT_EMAIL]";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-2 p-6">
      <h2 className="display text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Plain-language privacy notice that describes what this app actually does today. It is a starting point, not legal advice:
 * have a lawyer review it for the places you publish in, and keep it in step with the code when data handling changes.
 * It is in English only; the rest of the app is translated.
 */
export default function Privacy() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 text-sm leading-6">
      <header>
        <h1 className="display text-3xl font-bold">Privacy</h1>
        <p className="muted mt-1">CompPilot is run by {operator}. Questions or requests: <a className="underline" href={`mailto:${email}`}>{email}</a>. Last updated 4 October 2026. This page is in English.</p>
      </header>

      <Block title="The short version">
        <p>Your analyses stay on your device unless you create an account. We don&apos;t run ads, and the app has no analytics or tracking scripts. Payments are handled by our payment provider, and we never see your card number.</p>
      </Block>

      <Block title="Without an account">
        <p>Analyses, your language choice and any report branding you set are saved in your browser or app on your device. We don&apos;t receive them. Clearing the site or app data deletes them.</p>
      </Block>

      <Block title="With an account">
        <ul className="list-disc space-y-1 ps-5">
          <li>We store your email address and sign-in details (the password is stored by our sign-in provider as a one-way hash, never in plain text).</li>
          <li>We store the analyses you save to your account: addresses, prices, dates, sizes, notes and settings you enter, and your plan status.</li>
          <li>Only you can read your analyses; our database enforces that per account.</li>
        </ul>
      </Block>

      <Block title="Payments">
        <p>Paid plans are billed through Stripe (or, in the iOS and Android apps, through Apple or Google when that is offered). Stripe receives your payment details. We receive your plan, billing period, and an identifier for your payment record, not your card number.</p>
      </Block>

      <Block title="Maps and addresses">
        <p>If you choose to locate addresses, the address text you typed is sent to a geocoding service to find it on a map (by default OpenStreetMap&apos;s Nominatim). When a map is shown, your device requests map tiles from a tile provider (by default OpenStreetMap), which can see your IP address and the area you are viewing. These services have their own privacy policies. Nothing is sent unless you use these features.</p>
      </Block>

      <Block title="Speaking and typing comps">
        <p>If you use the microphone to add comps, your browser records your voice while you press Speak and sends it to its own speech-recognition service (for example Google in Chrome, or Apple in Safari) to turn it into text. The browser asks you to confirm this the first time. CompPilot receives only the text, which stays on your device until you add the comps; we never receive the audio. Typing works everywhere and sends nothing.</p>
      </Block>

      <Block title="Market data">
        <p>The daily market figures come from public national price indices (currently the Bank for International Settlements). They are downloaded by our server and contain no personal data. When you view them, we receive only the country you picked.</p>
      </Block>

      <Block title="Keeping and deleting your data">
        <p>You can delete your account in the app (Account, then Delete account). That permanently deletes your account and the analyses saved to it and cancels any plan bought on the web straight away. Subscriptions bought through Apple or Google are cancelled in your Apple or Google account settings. We may keep records of payments that tax or accounting law requires us to keep.</p>
      </Block>

      <Block title="Your rights">
        <p>Depending on where you live you may have the right to see, correct, export or delete your data, or to object to how it is used. Write to <a className="underline" href={`mailto:${email}`}>{email}</a> and we will respond.</p>
      </Block>

      <Block title="Children">
        <p>CompPilot is a professional tool and is not directed at children.</p>
      </Block>

      <Block title="Changes">
        <p>If this page changes in a way that matters, we will update the date above.</p>
      </Block>
    </article>
  );
}
