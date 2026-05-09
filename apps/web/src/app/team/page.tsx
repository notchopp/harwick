import { AppShell } from "../../components/app-shell";
import { requireActiveWorkspace } from "../../features/auth/session";
import { TeamPageContent } from "../../features/workspace/workspace-pages";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/team" });

  return (
    <AppShell
      activeItem="Team"
      memberName={membership.displayName}
      memberRole={membership.role}
      title="Team"
      workspaceName={membership.workspaceName}
    >
      <TeamPageContent />
    </AppShell>
  );
}
