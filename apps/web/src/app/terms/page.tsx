export const dynamic = "force-static";

export const metadata = {
  title: "Terms of Service — Harwick",
  description: "Terms governing your use of Harwick and connected services.",
};

const LAST_UPDATED = "2026-05-07";

export default function Page() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-12 text-[14px] leading-6 text-foreground">
      <a className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-foreground" href="/">
        <span aria-hidden="true">&larr;</span> Back to home
      </a>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-subtle">harwick</p>
        <h1 className="mt-2 font-display text-[28px] font-medium">Terms of Service</h1>
        <p className="mt-2 text-[12px] text-muted">Last updated: {LAST_UPDATED}</p>
      </header>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">1. The service</h2>
        <p>
          Harwick is a private lead-management workspace for real estate teams. By creating a workspace or being invited to
          one, you accept these Terms of Service and the Harwick <a className="underline" href="/privacy">Privacy Policy</a>.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">2. Eligibility and accounts</h2>
        <p>
          You must be at least 18 years old and authorized to act on behalf of any business or page you connect. The
          workspace owner is responsible for adding members, granting roles, and managing access.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">3. Connected accounts and platform compliance</h2>
        <p>
          When you connect Instagram, Facebook, Follow Up Boss, Google Calendar, Twilio, Retell, or Stripe, you grant Harwick
          permission to access those accounts as needed to operate the service. You agree to use Harwick in compliance with
          the terms of those underlying platforms, including the Meta Platform Terms, Google API Services User Data Policy,
          and Twilio Acceptable Use Policy.
        </p>
        <p>
          You will not use Harwick to send unsolicited messages, to harass any person, or to circumvent rate limits or other
          platform safeguards.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">4. AI behavior and approvals</h2>
        <p>
          Harwick AI generates draft replies, qualification questions, routing decisions, and follow-up actions. External
          actions that affect your CRM, calendar, or outbound messaging require operator approval through the workspace
          unless you explicitly opt that workspace into auto-execute. You are responsible for reviewing AI output before it
          reaches your customers.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">5. Billing</h2>
        <p>
          Paid plans are billed through Stripe. Plan tiers and pricing are shown at sign-up. Usage limits, overage charges,
          and renewal terms are disclosed during checkout. You can cancel at any time; cancellation takes effect at the end
          of the current billing period.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">6. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Use Harwick for unlawful purposes or to harm others.</li>
          <li>Attempt to bypass authentication, RLS, rate limits, or audit logging.</li>
          <li>Reverse-engineer, scrape, or resell the service or its outputs.</li>
          <li>Upload content you do not have rights to use.</li>
        </ul>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">7. Termination</h2>
        <p>
          We may suspend or terminate access for material breach of these terms, abusive behavior, or platform-policy
          violations. You may terminate at any time by deleting your workspace or emailing <a className="underline" href="mailto:support@harwick.lol">support@harwick.lol</a>.
          On termination we delete personal data within 30 days as described in the Privacy Policy.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">8. Disclaimer and limitation of liability</h2>
        <p>
          The service is provided on an &quot;as is&quot; basis. Harwick AI assists with workflow but does not provide legal,
          financial, or real-estate licensing advice. To the maximum extent permitted by law, Harwick is not liable for any
          indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenue, whether
          incurred directly or indirectly, arising from your use of the service.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">9. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. Continued use of Harwick after an update means you accept the updated
          terms. Material changes will be communicated via email or in-app notice.
        </p>
      </section>

      <footer className="mt-12 border-t pt-6 text-[12px] text-muted">
        <p>Questions? <a className="underline" href="mailto:support@harwick.lol">support@harwick.lol</a> · See our <a className="underline" href="/privacy">Privacy Policy</a> and <a className="underline" href="/data-deletion">Data Deletion</a> pages.</p>
      </footer>
    </main>
  );
}
