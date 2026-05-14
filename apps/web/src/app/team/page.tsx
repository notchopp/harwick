import { AppShell } from "../../components/app-shell";
import { requireActiveWorkspace } from "../../features/auth/session";
import { TeamPageContent } from "../../features/team/team-page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/team" });

  return (
    <AppShell
      activeItem="Team"
      memberName={membership.displayName}
      memberRole={membership.role}
      operatorRole={membership.role}
      tone="dashboardDark"
      title="Team"
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
    >
      <TeamPageContent
        currentMemberId={membership.memberId}
        operatorName={membership.displayName}
        operatorRole={membership.role}
        workspaceId={membership.workspaceId}
        workspaceName={membership.workspaceName}
      />
    </AppShell>
  );
}
