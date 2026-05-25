import {
  Bot,
  Brain,
  Building2,
  CheckSquare,
  ChevronRight,
  FileText,
  Hash,
  History,
  Inbox,
  LogOut,
  Mic,
  Plug,
  Settings,
  UsersRound,
} from "lucide-react";

import { AppShell } from "../../components/app-shell";
import { Shell } from "../../components/panels/panels";
import { MicroLabel, MonoTag } from "../../components/panels/typography";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { requireActiveWorkspace } from "../../features/auth/session";
import { initialsFor } from "../../lib/initials";

export const dynamic = "force-dynamic";

type Row = {
  label: string;
  href: string;
  icon: typeof Bot;
  description?: string;
};

const WORKSPACE_ROWS: Row[] = [
  { label: "Channels", href: "/channels", icon: Hash, description: "Realtime workspace rooms with @harwick" },
  { label: "Queue", href: "/queue", icon: CheckSquare, description: "Today's drafts + handoffs in one place" },
  { label: "Listings", href: "/listings", icon: Building2, description: "Verified inventory the AI quotes from" },
  { label: "Team", href: "/team", icon: UsersRound, description: "Roster, capacity, routing" },
  { label: "Intake", href: "/intake", icon: Inbox, description: "Live public conversations as they come in" },
  { label: "Memory", href: "/memory", icon: Brain, description: "What Harwick has learned" },
  { label: "Artifacts", href: "/artifacts", icon: FileText, description: "Saved drafts, briefs, docs" },
];

const SYSTEM_ROWS: Row[] = [
  { label: "Integrations", href: "/integrations", icon: Plug, description: "Meta, Follow Up Boss, Google Calendar, Retell" },
  { label: "Activity", href: "/activity", icon: History, description: "Audit log of every AI action" },
  { label: "Settings", href: "/settings", icon: Settings, description: "Workspace, billing, policy" },
];

function NavRow({ row }: { row: Row }) {
  const Icon = row.icon;
  return (
    <a
      href={row.href}
      className="flex items-center gap-3 border-b border-[color:var(--panel-line-soft)] px-4 py-3 transition last:border-b-0 active:bg-[color:var(--panel-3)]"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)]">
        <Icon className="size-4" aria-hidden="true" strokeWidth={1.85} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold text-[color:var(--graphite-text)]">{row.label}</span>
        {row.description === undefined ? null : (
          <span className="block truncate text-[11.5px] text-[color:var(--graphite-text-muted)]">{row.description}</span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-[color:var(--graphite-text-faint)]" aria-hidden="true" />
    </a>
  );
}

export default async function Page() {
  const { session, membership } = await requireActiveWorkspace({ nextPath: "/more" });

  const memberName = membership.displayName ?? session.user.email ?? "Operator";
  const memberRole = membership.role
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const email = session.user.email ?? "";

  return (
    <AppShell
      activeItem="More"
      memberName={memberName}
      memberRole={membership.role}
      operatorRole={membership.role}
      tone="dashboardDark"
      title="More"
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
    >
      <main className="flex min-h-full flex-col gap-4 px-4 py-5">
        {/* Workspace switcher chip */}
        <Shell className="flex items-center gap-3 p-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[12px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)]">
            <img alt="" className="size-8 object-contain" src="/harwick-gemini-logo.png" />
          </span>
          <div className="min-w-0 flex-1">
            <MicroLabel>workspace</MicroLabel>
            <div className="mt-0.5 truncate text-[14.5px] font-semibold tracking-[-0.005em] text-[color:var(--graphite-text)]">
              {membership.workspaceName}
            </div>
            <div className="truncate text-[11.5px] text-[color:var(--graphite-text-muted)]">
              {memberRole} · {membership.workspaceSlug}
            </div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-[color:var(--graphite-text-faint)]" aria-hidden="true" />
        </Shell>

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <MicroLabel>Workspace</MicroLabel>
            <MonoTag>{WORKSPACE_ROWS.length}</MonoTag>
          </div>
          <Shell className="overflow-hidden">
            {WORKSPACE_ROWS.map((row) => <NavRow key={row.href} row={row} />)}
          </Shell>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <MicroLabel>Voice</MicroLabel>
          </div>
          <Shell className="overflow-hidden">
            <a
              href="/v?voice=1"
              className="flex items-center gap-3 border-b border-[color:var(--panel-line-soft)] px-4 py-3 transition active:bg-[color:var(--panel-3)]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--sage)]/30 bg-[var(--sage-soft)] text-[var(--sage)]">
                <Mic className="size-4" aria-hidden="true" strokeWidth={1.85} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[color:var(--graphite-text)]">Talk to Harwick</span>
                <span className="block truncate text-[11.5px] text-[color:var(--graphite-text-muted)]">Hands-free voice — phone, car, anywhere</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-[color:var(--graphite-text-faint)]" aria-hidden="true" />
            </a>
            <a
              href="/help/voice"
              className="flex items-center gap-3 px-4 py-3 transition active:bg-[color:var(--panel-3)]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)]">
                <Bot className="size-4" aria-hidden="true" strokeWidth={1.85} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[color:var(--graphite-text)]">Set up Siri Shortcut</span>
                <span className="block truncate text-[11.5px] text-[color:var(--graphite-text-muted)]">&ldquo;Hey Siri, ask Harwick…&rdquo;</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-[color:var(--graphite-text-faint)]" aria-hidden="true" />
            </a>
          </Shell>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <MicroLabel>System</MicroLabel>
          </div>
          <Shell className="overflow-hidden">
            {SYSTEM_ROWS.map((row) => <NavRow key={row.href} row={row} />)}
          </Shell>
        </section>

        <section>
          <div className="mb-2 px-1">
            <MicroLabel>Account</MicroLabel>
          </div>
          <Shell className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[color:var(--panel-line-soft)] px-4 py-3">
              <Avatar className="size-10">
                <AvatarFallback className="bg-[color:var(--panel-3)] text-[12px] font-semibold text-[color:var(--graphite-text)]">
                  {initialsFor(memberName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-[color:var(--graphite-text)]">{memberName}</div>
                <div className="truncate text-[11.5px] text-[color:var(--graphite-text-muted)]">{email}</div>
              </div>
            </div>
            <form action="/auth/logout" method="post">
              <button
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:bg-[color:var(--panel-3)]"
                type="submit"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--oxblood)]/30 bg-[var(--oxblood-soft)] text-[var(--oxblood)]">
                  <LogOut className="size-4" aria-hidden="true" strokeWidth={1.85} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-[var(--oxblood)]">Sign out</span>
                </span>
              </button>
            </form>
          </Shell>
        </section>

        <div className="px-1 py-2 text-center text-[10.5px] uppercase tracking-[0.14em] text-[color:var(--graphite-text-faint)]">
          Harwick · {membership.workspaceSlug}
        </div>
      </main>
    </AppShell>
  );
}
