export const dynamic = "force-static";

export const metadata = {
  title: "Data Deletion — Harwick",
  description: "How to request deletion of your data from Harwick, including the Meta-compliant deletion endpoint.",
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
        <h1 className="mt-2 font-display text-[28px] font-medium">Data Deletion</h1>
        <p className="mt-2 text-[12px] text-muted">Last updated: {LAST_UPDATED}</p>
      </header>

      <section className="mb-8 space-y-3">
        <p>
          You can request deletion of your data from Harwick at any time. We process all deletion requests within
          <strong> 30 days</strong>, and confirm completion by email.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">Option 1 — Email request</h2>
        <ol className="list-decimal space-y-2 pl-6">
          <li>
            Email <a className="underline" href="mailto:support@harwick.lol">support@harwick.lol</a> from the address associated with your Harwick account.
          </li>
          <li>
            Subject: <em>&quot;Data deletion request&quot;</em>.
          </li>
          <li>
            Include the workspace name (if you remember it) and any connected Facebook Page ID, Instagram handle, or phone
            number you want removed.
          </li>
          <li>
            We will confirm receipt within 2 business days, complete deletion within 30 days, and email you a confirmation
            code when finished.
          </li>
        </ol>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">Option 2 — Remove Harwick from your Facebook account</h2>
        <p>
          If you connected Harwick through Facebook or Instagram and want to revoke access:
        </p>
        <ol className="list-decimal space-y-2 pl-6">
          <li>Open Facebook → <em>Settings &amp; privacy → Settings → Apps and Websites</em>.</li>
          <li>Find <strong>Harwick</strong> in the list of connected apps and click <em>Remove</em>.</li>
          <li>
            Facebook will notify Harwick. We disconnect the integration immediately and queue the associated workspace data
            for deletion within 30 days.
          </li>
          <li>
            Facebook will give you a confirmation code. To check status, email that code to
            <a className="underline" href="mailto:support@harwick.lol"> support@harwick.lol</a>.
          </li>
        </ol>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">Option 3 — Delete your workspace</h2>
        <p>
          Workspace owners can request full workspace deletion by emailing
          <a className="underline" href="mailto:support@harwick.lol"> support@harwick.lol</a> from the owner email on file.
          We will verify ownership, delete the workspace and all associated leads, conversations, integrations, audit logs
          (after the legally required retention period), and member data within 30 days.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">What gets deleted</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Workspace lead records, conversation messages, and lead events.</li>
          <li>Integration credentials (Meta, Google, FUB, Twilio, Retell, Stripe) — encrypted refs are wiped immediately on disconnect.</li>
          <li>Workspace memory documents, AI turns, and tool-call logs that reference your data.</li>
          <li>Calendar connection records and showing tasks scoped to your workspace.</li>
          <li>Billing customer references after any required tax-record retention.</li>
        </ul>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">What may be retained</h2>
        <p>
          We retain certain audit logs and provider error events for at least 12 months for security, debugging, and
          compliance. These are stripped of personal identifiers where feasible.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">Meta deletion endpoint</h2>
        <p>
          For Meta&apos;s automated app-level data deletion request flow, the endpoint is:
        </p>
        <pre className="overflow-x-auto rounded-md bg-muted/30 p-3 text-[12px]">
          <code>POST https://harwick.lol/api/meta/data-deletion</code>
        </pre>
        <p>
          This endpoint accepts Meta&apos;s signed_request payload, verifies it against our app secret, returns a confirmation
          code, and disconnects integration accounts tied to the requesting Meta user.
        </p>
      </section>

      <footer className="mt-12 border-t pt-6 text-[12px] text-muted">
        <p>
          Questions? <a className="underline" href="mailto:support@harwick.lol">support@harwick.lol</a> · See our
          <a className="underline" href="/privacy"> Privacy Policy</a> and <a className="underline" href="/terms"> Terms of Service</a>.
        </p>
      </footer>
    </main>
  );
}
