import { LeadsPageContent } from "../../features/leads/leads-page";
import { AppShell } from "../../components/app-shell";
import { requireActiveWorkspace } from "../../features/auth/session";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/leads" });

  return (
    <AppShell activeItem="Leads" title="Leads" workspaceName={membership.workspaceName}>
      <LeadsPageContent
        workspaceId={membership.workspaceId}
        workspaceName={membership.workspaceName}
        currentMemberId={membership.memberId}
      />
    </AppShell>
  );
}
