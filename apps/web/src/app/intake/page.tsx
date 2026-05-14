import { AppShell } from "../../components/app-shell";
import { requireActiveWorkspace } from "../../features/auth/session";
import { IntakePageContent } from "../../features/workspace/workspace-pages";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/intake" });

  return (
    <AppShell
      activeItem="Intake"
      memberName={membership.displayName}
      memberRole={membership.role}
      operatorRole={membership.role}
      title="Intake"
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
    >
      <IntakePageContent />
    </AppShell>
  );
}
