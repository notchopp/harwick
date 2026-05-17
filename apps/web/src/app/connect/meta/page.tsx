export const dynamic = "force-static";

export const metadata = {
  title: "Connect Instagram + Facebook — Harwick",
  description:
    "What Harwick reads, why we need it, and what we won't do with your Meta data. Read this before connecting your Page and Instagram Business Account.",
};

type PermissionRow = {
  name: string;
  reason: string;
};

const PERMISSIONS: PermissionRow[] = [
  {
    name: "instagram_business_basic",
    reason:
      "Read your Instagram Business Account's id, username, name, and profile picture so Harwick can show the right account in the workspace.",
  },
  {
    name: "instagram_business_manage_messages",
    reason:
      "Receive incoming Instagram DMs to your Business Account and send replies on your behalf — only after you draft or approve the reply, or under an automation policy you've explicitly enabled.",
  },
  {
    name: "instagram_business_manage_comments",
    reason:
      "Read comments on your Instagram posts and Reels and post comment replies — same human-in-the-loop rule as DMs.",
  },
  {
    name: "pages_show_list",
    reason: "List the Facebook Pages you admin so you can pick which one to connect.",
  },
  {
    name: "pages_manage_metadata",
    reason:
      "Subscribe the connected Page to Harwick's webhooks so we receive new messages and comments in real time.",
  },
  {
    name: "pages_messaging",
    reason:
      "Receive incoming Facebook Page DMs and send replies through Messenger when your team approves a draft.",
  },
  {
    name: "pages_read_engagement",
    reason:
      "Read comments and the surrounding post context so reply suggestions are grounded in what was actually posted.",
  },
  {
    name: "pages_manage_engagement",
    reason: "Post comment replies, hide spam, and manage comment threads on your behalf.",
  },
];

const PROMISES: string[] = [
  "We use Meta Platform Data only to operate the lead-management features you turn on — capturing inbound DMs and comments, qualifying and routing leads, drafting and sending replies on your behalf, and syncing qualified leads to your CRM.",
  "We do not sell, license, rent, or transfer Meta Platform Data to any third party for advertising, data brokerage, ad-targeting, audience-building, or any commercial purpose unrelated to the service you're using.",
  "We do not use Meta Platform Data to train, fine-tune, or improve any generalized, foundation, or third-party AI model. Our sub-processors are configured with training disabled.",
  "Meta Platform Data is hosted in the United States, encrypted at rest with AES-256 and in transit with TLS 1.2+.",
  "When you disconnect Meta from Harwick, your access tokens are revoked immediately and conversation data tied to the integration is purged within 30 days unless we're legally required to retain it.",
];

export default function ConnectMetaPage() {
  return (
    <main className="mx-auto max-w-[760px] px-6 py-12 text-[14px] leading-6 text-foreground">
      <a className="mb-6 inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-foreground" href="/">
        <span aria-hidden="true">&larr;</span> Back to home
      </a>
      <header className="mb-8">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-subtle">harwick</p>
        <h1 className="mt-2 font-display text-[28px] font-medium">Connect Instagram + Facebook</h1>
        <p className="mt-3 text-[13px] leading-6 text-muted">
          Harwick connects to your Facebook Page and the Instagram Business Account linked to it so your team can manage
          lead conversations from one place. Here's exactly what we read, why, and what we promise not to do with it.
        </p>
      </header>

      <section className="mb-10 space-y-3">
        <h2 className="font-display text-[18px] font-medium">What you'll authorize</h2>
        <p>
          When you click <strong>Connect Meta</strong>, Meta will ask you to grant the following permissions to Harwick.
          You can revoke them at any time from Facebook&nbsp;
          <a className="underline" href="https://www.facebook.com/settings?tab=business_tools">
            Business Integrations
          </a>{" "}
          or directly inside Harwick&nbsp;
          <span>(Settings → Integrations → Disconnect Meta)</span>.
        </p>
        <div className="overflow-hidden rounded-[12px] border">
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-surface-muted text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Permission</th>
                <th className="px-3 py-2 font-medium">Why we need it</th>
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((row) => (
                <tr key={row.name} className="border-t">
                  <td className="px-3 py-2 align-top">
                    <code className="rounded bg-surface-muted px-1 py-0.5 text-[11.5px]">{row.name}</code>
                  </td>
                  <td className="px-3 py-2 text-foreground">{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-10 space-y-3">
        <h2 className="font-display text-[18px] font-medium">What we promise not to do</h2>
        <ul className="list-disc space-y-2 pl-6">
          {PROMISES.map((promise) => (
            <li key={promise}>{promise}</li>
          ))}
        </ul>
        <p className="text-[12.5px] text-muted">
          The full text — including data retention, sub-processors, and the deletion process — lives in our{" "}
          <a className="underline" href="/privacy">Privacy Policy</a>.
        </p>
      </section>

      <section className="mb-10 space-y-3">
        <h2 className="font-display text-[18px] font-medium">After connecting</h2>
        <ol className="list-decimal space-y-2 pl-6">
          <li>
            Harwick subscribes your Facebook Page to incoming-message and comment webhooks. We do not post on your wall,
            change your Page details, or send broadcast messages.
          </li>
          <li>
            Replies are drafted by Harwick AI but require approval from a workspace member by default. You can adjust
            this per conversation in <a className="underline" href="/settings">Settings → Automation</a>.
          </li>
          <li>
            Replies sent more than 24&nbsp;hours after a lead's last message use Meta's{" "}
            <a
              className="underline"
              href="https://developers.facebook.com/docs/messenger-platform/send-messages/message-tags#human_agent"
              rel="noreferrer"
              target="_blank"
            >
              Human Agent
            </a>{" "}
            tag, which allows up to 7&nbsp;days for a human-handled response. The composer shows the active window
            before you send.
          </li>
          <li>
            You can disconnect at any time. Disconnection revokes tokens, stops webhooks, and queues 30-day deletion of
            associated conversation data.
          </li>
        </ol>
      </section>

      <section className="mb-10 space-y-3">
        <h2 className="font-display text-[18px] font-medium">Ready to connect?</h2>
        <p>
          Sign in to Harwick, then open <strong>Settings → Integrations</strong> and click <strong>Connect Meta</strong>.
          You'll be redirected to Facebook to choose a Page and approve the permissions above.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[12.5px]">
          <a
            className="inline-flex items-center rounded-[8px] border border-foreground bg-foreground px-4 py-2 font-medium text-background hover:bg-foreground/90"
            href="/login"
          >
            Sign in and connect
          </a>
          <a className="underline text-muted" href="/privacy">Privacy Policy</a>
          <a className="underline text-muted" href="/terms">Terms</a>
          <a className="underline text-muted" href="/data-deletion">Data Deletion</a>
        </div>
      </section>
    </main>
  );
}
