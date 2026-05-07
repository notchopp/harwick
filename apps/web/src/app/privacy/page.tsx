export const dynamic = "force-static";

export const metadata = {
  title: "Privacy Policy — Harwick",
  description: "How Harwick collects, uses, and protects data from Meta, integrations, and workspace activity.",
};

const LAST_UPDATED = "2026-05-07";

export default function Page() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-12 text-[14px] leading-6 text-foreground">
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-subtle">harwick</p>
        <h1 className="mt-2 font-display text-[28px] font-medium">Privacy Policy</h1>
        <p className="mt-2 text-[12px] text-muted">Last updated: {LAST_UPDATED}</p>
      </header>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">1. Who we are</h2>
        <p>
          Harwick is a private lead-management workspace for real estate teams. Workspaces connect their own Instagram and
          Facebook pages, CRM (Follow Up Boss), calendar (Google Calendar), and voice/SMS providers so Harwick AI can capture
          inbound leads, qualify them through conversation, route them to the right agent, and sync qualified leads to the
          team&apos;s system of record.
        </p>
        <p>
          Harwick is operated by the Harwick team. To contact us about privacy, email <a className="underline" href="mailto:support@harwick.lol">support@harwick.lol</a>.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">2. Data we collect</h2>
        <p>We collect only the data needed to operate the service.</p>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Workspace account data:</strong> name, email, role, workspace membership.</li>
          <li><strong>Meta-connected page data:</strong> Facebook Page ID and name, Instagram Business Account ID and handle, page access tokens (encrypted at rest), and post/comment context for posts your team publishes.</li>
          <li><strong>Conversation data from connected channels:</strong> Instagram and Facebook DMs and comments to and from your connected pages, including message content, sender ID, and timestamps. We also process voice call transcripts when you connect Retell, and SMS message content when you connect Twilio.</li>
          <li><strong>Lead data:</strong> contact info, source, qualification answers, intent score, assignment, status, and conversation history.</li>
          <li><strong>Calendar availability:</strong> when a member connects Google Calendar, we read FreeBusy windows and write showing events to their primary calendar. We do not read event titles or attendee lists.</li>
          <li><strong>Integration credentials:</strong> OAuth tokens and API keys for Meta, Google Calendar, Follow Up Boss, Twilio, Retell, and Stripe, encrypted with AES-256 before storage.</li>
          <li><strong>Operational telemetry:</strong> audit logs, AI tool calls, automation policy decisions, error events, and provider failures, used to operate and improve the service.</li>
        </ul>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">3. How we use data</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>To capture inbound leads from your connected channels and run the Harwick AI runtime that qualifies, routes, and surfaces them.</li>
          <li>To sync qualified leads to your connected CRM (Follow Up Boss) when you authorize that action.</li>
          <li>To support workspace members in viewing and acting on lead activity.</li>
          <li>To meter usage for billing and to apply plan-level limits.</li>
          <li>To detect provider failures, RLS policy violations, and abuse, and to keep the platform safe.</li>
        </ul>
        <p>We do not sell data. We do not use Meta-derived data to advertise to your end users.</p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">4. Sub-processors</h2>
        <p>Harwick uses the following providers to deliver the service:</p>
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Supabase</strong> — managed Postgres + auth + storage.</li>
          <li><strong>Vercel</strong> — application hosting and edge runtime.</li>
          <li><strong>OpenAI</strong> — language-model inference for the Harwick AI runtime. We do not enable training on customer data.</li>
          <li><strong>Stripe</strong> — billing.</li>
          <li><strong>Twilio</strong> — SMS messaging when enabled by the workspace.</li>
          <li><strong>Retell</strong> — voice agent provisioning and call handling when enabled by the workspace.</li>
          <li><strong>Google</strong> — Calendar API for FreeBusy and event creation when a member connects their Google account.</li>
          <li><strong>Follow Up Boss</strong> — CRM sync when a workspace connects FUB.</li>
        </ul>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">5. Data retention</h2>
        <p>
          Active workspace data is retained while the workspace is active. Audit logs are retained for at least 12 months for
          security and compliance. When a workspace is deleted or a user requests deletion, we remove personal data within
          30 days, except where a longer retention is required by law.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">6. Your rights and how to delete your data</h2>
        <p>
          You can request deletion of your data at any time. Detailed instructions, including the request endpoint Meta uses
          for app-level deletion requests, are at <a className="underline" href="/data-deletion">harwick.lol/data-deletion</a>.
          You can also email <a className="underline" href="mailto:support@harwick.lol">support@harwick.lol</a> from the address
          associated with your account.
        </p>
        <p>
          Depending on your jurisdiction (for example, GDPR in the EU/UK, CCPA in California) you may also have rights to
          access, correct, port, or restrict processing of your data. Email us to exercise those rights.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">7. Security</h2>
        <p>
          Data in transit is encrypted with TLS. Integration credentials and OAuth tokens are encrypted at rest with AES-256.
          Access to production systems is restricted, audited, and bounded by row-level security on the database. We follow
          standard industry practice for incident detection and response.
        </p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">8. Children</h2>
        <p>Harwick is a B2B service and is not directed to children under 13.</p>
      </section>

      <section className="mb-8 space-y-3">
        <h2 className="font-display text-[18px] font-medium">9. Changes</h2>
        <p>
          We will update this policy when material changes occur and update the &quot;Last updated&quot; date above. Continued use of
          Harwick after a change means you accept the updated policy.
        </p>
      </section>

      <footer className="mt-12 border-t pt-6 text-[12px] text-muted">
        <p>Questions? <a className="underline" href="mailto:support@harwick.lol">support@harwick.lol</a> · See also our <a className="underline" href="/terms">Terms of Service</a> and <a className="underline" href="/data-deletion">Data Deletion</a> pages.</p>
      </footer>
    </main>
  );
}
