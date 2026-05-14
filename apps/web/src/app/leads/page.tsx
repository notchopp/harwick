import { LeadsPageContent } from "../../features/leads/leads-page";
import { AppShell } from "../../components/app-shell";
import { requireActiveWorkspace } from "../../features/auth/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/leads" });

  return (
    <AppShell
      activeItem="Leads"
      memberName={membership.displayName}
      memberRole={membership.role}
      operatorRole={membership.role}
      tone="dashboardDark"
      title="Leads"
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
    >
      <LeadsPageContent
        workspaceId={membership.workspaceId}
        workspaceName={membership.workspaceName}
        currentMemberId={membership.memberId}
      />
    </AppShell>
  );
}
