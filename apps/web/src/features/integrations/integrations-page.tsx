"use client";

import {
  CalendarDays,
  DatabaseZap,
  ExternalLink,
  KeyRound,
  Loader2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { FacebookGlyph, InstagramGlyph } from "../../components/harwick-icons";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { WorkspaceTopbar } from "../../components/workspace-topbar";
import { cn } from "../../lib/utils";
import type { IntegrationsPageData, WorkspaceIntegrationAccount } from "./integrations-data";

type IntegrationAction = "meta" | "meta_disconnect" | "fub" | "fub_test" | "calendar" | null;

type IntegrationsPageContentProps = {
  data: IntegrationsPageData;
  workspaceId: string;
  workspaceName: string;
};

function MetaProviderMarks() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#d66b9c]/20 bg-[#f6d9e8] text-[#b73578]">
        <InstagramGlyph className="h-3.5 w-3.5" />
      </span>
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#1877f2]/15 bg-[#dfeafe] text-[#1877f2]">
        <FacebookGlyph className="h-3.5 w-3.5" />
      </span>
    </div>
  );
}

function newestAccount(
  accounts: WorkspaceIntegrationAccount[],
  provider: WorkspaceIntegrationAccount["provider"],
) {
  return accounts.find((account) => account.provider === provider) ?? null;
}

function statusLabel(account: WorkspaceIntegrationAccount | null, fallback = "not connected") {
  if (account === null) return fallback;
  if (account.status === "connected") return "connected";
  if (account.status === "needs_reauth") return "needs reconnect";
  if (account.status === "error") return "error";
  return account.status;
}

function statusTone(account: WorkspaceIntegrationAccount | null) {
  if (account === null) return "border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)]";
  if (account.status === "connected") return "border-qualified/20 bg-qualified/10 text-qualified";
  if (account.status === "needs_reauth" || account.status === "error") {
    return "border-oxblood-soft bg-oxblood-soft/60 text-hot";
  }
  return "border-clay/20 bg-clay/10 text-clay";
}

function formatDate(value: string | null) {
  if (value === null) return "not checked";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function ProviderStatus(props: { account: WorkspaceIntegrationAccount | null; fallback?: string }) {
  return (
    <span className={cn("harwick-pill px-2.5 py-1 text-[11px] font-medium", statusTone(props.account))}>
      {statusLabel(props.account, props.fallback)}
    </span>
  );
}

function SummaryStat(props: { label: string; value: string; tone?: "good" | "warn" }) {
  return (
    <div className="harwick-stat-card px-4 py-3">
      <div className="font-display text-[25px] leading-none text-[color:var(--graphite-text)]">{props.value}</div>
      <div className={cn("mt-1 text-[11px] text-[color:var(--graphite-text-faint)]", props.tone === "good" && "text-qualified", props.tone === "warn" && "text-clay")}>
        {props.label}
      </div>
    </div>
  );
}

function IntegrationCard(props: {
  account: WorkspaceIntegrationAccount | null;
  action?: React.ReactNode;
  children?: React.ReactNode;
  description: string;
  icon: React.ReactNode;
  meta?: string;
  title: string;
}) {
  return (
      <section className="rounded-[var(--panel-radius-lg)] border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] p-4 shadow-[var(--panel-inset-top),var(--panel-shadow-lift)] sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text)] shadow-[var(--panel-inset-top-soft)]">
          {props.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[19px] font-medium leading-none text-[color:var(--graphite-text)]">{props.title}</h2>
              <p className="mt-2 max-w-[620px] text-[12.5px] leading-5 text-[color:var(--graphite-text-muted)]">{props.description}</p>
            </div>
            <ProviderStatus account={props.account} />
          </div>
          <div className="mt-4 grid gap-2 border-t border-[color:var(--panel-line-soft)] pt-3 text-[11.5px] text-[color:var(--graphite-text-faint)] sm:grid-cols-3">
            <div>
              <span className="block uppercase tracking-[0.12em]">account</span>
              <strong className="mt-1 block truncate font-medium normal-case tracking-normal text-[color:var(--graphite-text)]">
                {props.account?.providerAccountName ?? props.meta ?? "none yet"}
              </strong>
            </div>
            <div>
              <span className="block uppercase tracking-[0.12em]">scope</span>
              <strong className="mt-1 block font-medium normal-case tracking-normal text-[color:var(--graphite-text)]">
                {props.account?.accountScope ?? "workspace"}
              </strong>
            </div>
            <div>
              <span className="block uppercase tracking-[0.12em]">last check</span>
              <strong className="mt-1 block font-medium normal-case tracking-normal text-[color:var(--graphite-text)]">
                {formatDate(props.account?.lastHealthCheckAt ?? null)}
              </strong>
            </div>
          </div>
          {props.children ? <div className="mt-4">{props.children}</div> : null}
        </div>
        {props.action ? <div className="shrink-0">{props.action}</div> : null}
      </div>
    </section>
  );
}

export function IntegrationsPageContent(props: IntegrationsPageContentProps) {
  const [busyAction, setBusyAction] = useState<IntegrationAction>(null);
  const [fubApiKey, setFubApiKey] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const metaAccount = useMemo(() => newestAccount(props.data.accounts, "meta"), [props.data.accounts]);
  const fubAccount = useMemo(() => newestAccount(props.data.accounts, "follow_up_boss"), [props.data.accounts]);
  const calendarAccount = useMemo(() => newestAccount(props.data.accounts, "google_calendar"), [props.data.accounts]);

  async function connectMeta() {
    setBusyAction("meta");
    setMessage(null);
    const response = await fetch("/api/meta/oauth/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: props.workspaceId,
        accountScope: "workspace",
        ownerMemberId: null,
      }),
    });
    const body = await response.json().catch(() => null) as { authorizationUrl?: string; error?: string } | null;
    if (!response.ok || body?.authorizationUrl === undefined) {
      setBusyAction(null);
      setMessage(body?.error ?? "Meta OAuth could not start.");
      return;
    }

    window.location.href = body.authorizationUrl;
  }

  async function disconnectMeta() {
    if (typeof window !== "undefined" && !window.confirm(
      "Disconnect Meta?\n\nThis revokes Harwick's access tokens for your Page and Instagram Business Account, "
      + "stops the webhook feed, and queues a 30-day deletion of associated conversation data. "
      + "Reconnecting later requires Meta's OAuth flow again.",
    )) {
      return;
    }
    setBusyAction("meta_disconnect");
    setMessage(null);
    const response = await fetch(`/api/workspaces/${props.workspaceId}/integrations/meta/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const body = await response.json().catch(() => null) as { confirmationCode?: string; disconnectedAccounts?: number; error?: string } | null;
    setBusyAction(null);
    if (!response.ok) {
      setMessage(body?.error ?? "Meta disconnect failed.");
      return;
    }
    const code = body?.confirmationCode?.slice(0, 8) ?? "—";
    setMessage(`Meta disconnected. Confirmation code: ${code}. Associated data will be deleted within 30 days.`);
    // Refresh so the card reflects the new status.
    if (typeof window !== "undefined") {
      window.setTimeout(() => window.location.reload(), 1200);
    }
  }

  async function connectFub() {
    setBusyAction("fub");
    setMessage(null);
    const response = await fetch(`/api/workspaces/${props.workspaceId}/integrations/follow-up-boss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: fubApiKey,
        providerAccountName: "Follow Up Boss",
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      setBusyAction(null);
      setMessage(body?.error ?? "Follow Up Boss did not connect.");
      return;
    }

    window.location.reload();
  }

  async function testFub() {
    setBusyAction("fub_test");
    setMessage(null);
    const response = await fetch(`/api/workspaces/${props.workspaceId}/integrations/follow-up-boss/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await response.json().catch(() => null) as { message?: string; error?: string } | null;
    setBusyAction(null);
    setMessage(response.ok
      ? body?.message ?? "Follow Up Boss connection is healthy."
      : body?.error ?? "Follow Up Boss connection test failed.");
  }

  async function connectCalendar() {
    setBusyAction("calendar");
    setMessage(null);
    const response = await fetch(`/api/workspaces/${props.workspaceId}/integrations/google-calendar/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await response.json().catch(() => null) as { authorizationUrl?: string; error?: string } | null;
    if (!response.ok || body?.authorizationUrl === undefined) {
      setBusyAction(null);
      setMessage(body?.error ?? "Google Calendar OAuth could not start.");
      return;
    }

    window.location.href = body.authorizationUrl;
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <WorkspaceTopbar context="integrations" workspaceName={props.workspaceName}>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-[color:var(--graphite-text-faint)]">
          <span className="h-1.5 w-1.5 rounded-full bg-qualified" />
          {props.workspaceName}
        </div>
      </WorkspaceTopbar>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--graphite-text-faint)]">workspace connections</div>
            <h1 className="mt-2 font-display text-[32px] font-medium leading-none text-[color:var(--graphite-text)]">integrations</h1>
            <p className="mt-3 max-w-[690px] text-[13px] leading-5 text-[color:var(--graphite-text-muted)]">
              Connect the customer-owned systems Harwick uses to answer social demand, sync qualified leads, and keep listing context current.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryStat label="Meta channels" tone="good" value={String(props.data.health.metaConnectedCount)} />
            <SummaryStat label="Calendars" tone={calendarAccount?.status === "connected" ? "good" : "warn"} value={calendarAccount?.status === "connected" ? "1" : "0"} />
            <SummaryStat label="FUB webhooks" value={`${props.data.health.fubActiveWebhooks}/${props.data.health.fubWebhookCount}`} />
            <SummaryStat label="Sync failures" tone={props.data.health.crmFailedSyncs > 0 ? "warn" : "good"} value={String(props.data.health.crmFailedSyncs)} />
          </div>
        </div>

        {message ? (
          <div className="mb-4 rounded-[12px] border border-oxblood-soft bg-oxblood-soft/40 px-4 py-3 text-[12px] text-hot">
            {message}
          </div>
        ) : null}

        {props.data.warnings.map((warning) => (
          <div
            className="mb-4 rounded-[12px] border border-clay/30 bg-clay/10 px-4 py-3 text-[12px] text-clay"
            key={warning}
          >
            {warning}
          </div>
        ))}

        <div className="grid gap-4">
          <IntegrationCard
            account={metaAccount}
            action={
              <div className="flex flex-col items-stretch gap-2">
                <Button className="px-4 text-[12px]" disabled={busyAction !== null} onClick={() => { void connectMeta(); }} type="button">
                  {busyAction === "meta" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-2 h-3.5 w-3.5" />}
                  {metaAccount?.status === "connected" ? "reconnect Meta" : "connect Meta"}
                </Button>
                {metaAccount !== null && metaAccount.status !== "disconnected" ? (
                  <Button className="px-4 text-[12px]" disabled={busyAction !== null} onClick={() => { void disconnectMeta(); }} type="button" variant="outline">
                    {busyAction === "meta_disconnect" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                    disconnect Meta
                  </Button>
                ) : null}
              </div>
            }
            description="Instagram and Facebook intake. This is where DMs, comments, page identity, and reply permissions start."
            icon={<MetaProviderMarks />}
            meta="Instagram / Facebook"
            title="Instagram + Facebook"
          >
            <div className="flex flex-wrap gap-2 text-[11px] text-[color:var(--graphite-text-muted)]">
              <span className="harwick-pill px-2.5 py-1">DM intake</span>
              <span className="harwick-pill px-2.5 py-1">comment intake</span>
              <span className="harwick-pill px-2.5 py-1">reply approval</span>
              <a className="harwick-pill px-2.5 py-1 underline" href="/connect/meta">what we read</a>
            </div>
          </IntegrationCard>

          <IntegrationCard
            account={fubAccount}
            description="Follow Up Boss remains the CRM of record. Harwick syncs qualified leads, activity, assignments, and conflict state here."
            icon={<DatabaseZap className="h-5 w-5" strokeWidth={1.7} />}
            meta="Follow Up Boss"
            title="Follow Up Boss"
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
              <Input
                aria-label="Follow Up Boss API key"
                className="h-10 text-[12px]"
                onChange={(event) => setFubApiKey(event.target.value)}
                placeholder={fubAccount ? "replace API key" : "paste FUB API key"}
                type="password"
                value={fubApiKey}
              />
              <div className="grid gap-2">
                <Button className="h-10 px-4 text-[12px]" disabled={busyAction !== null || fubApiKey.trim().length === 0} onClick={() => { void connectFub(); }} type="button">
                  {busyAction === "fub" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-2 h-3.5 w-3.5" />}
                  save key
                </Button>
                <Button className="h-10 px-4 text-[12px]" disabled={busyAction !== null || fubAccount === null} onClick={() => { void testFub(); }} type="button" variant="outline">
                  {busyAction === "fub_test" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <DatabaseZap className="mr-2 h-3.5 w-3.5" />}
                  test saved key
                </Button>
                <div className="harwick-control px-3 py-2 text-[11px] text-[color:var(--graphite-text-faint)]">
                  {props.data.health.fubActiveWebhooks} active back-sync subscriptions
                </div>
              </div>
            </div>
          </IntegrationCard>

          <IntegrationCard
            account={calendarAccount}
            action={
              <Button className="px-4 text-[12px]" disabled={busyAction !== null} onClick={() => { void connectCalendar(); }} type="button" variant="outline">
                {busyAction === "calendar" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="mr-2 h-3.5 w-3.5" />}
                connect calendar
              </Button>
            }
            description="Member-scoped Google Calendar connection for showing availability. Harwick uses this before proposing request-and-approve showing windows."
            icon={<CalendarDays className="h-5 w-5" strokeWidth={1.7} />}
            meta="Google Calendar"
            title="Google Calendar"
          >
            <div className="flex flex-wrap gap-2 text-[11px] text-[color:var(--graphite-text-muted)]">
              <span className="harwick-pill px-2.5 py-1">member availability</span>
              <span className="harwick-pill px-2.5 py-1">request + approve</span>
              <span className="harwick-pill px-2.5 py-1">FreeBusy lookup</span>
            </div>
            <p className="mt-3 text-[11px] leading-4 text-[color:var(--graphite-text-faint)]">
              tip: connect google calendar to enable showings and memory. members who sign in with google can grant access in one step; everyone else can connect here.
            </p>
          </IntegrationCard>
        </div>
      </div>
    </div>
  );
}
