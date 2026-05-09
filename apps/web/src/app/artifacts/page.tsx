import { AppShell } from "../../components/app-shell";
import { requireActiveWorkspace } from "../../features/auth/session";
import { ArtifactsPageContent } from "../../features/workspace/workspace-pages";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/artifacts" });

  return (
    <AppShell
      activeItem="Artifacts"
      memberName={membership.displayName}
      memberRole={membership.role}
      title="Artifacts"
      workspaceName={membership.workspaceName}
    >
      <ArtifactsPageContent />
    </AppShell>
  );
}
