import { AppShell } from "../../components/app-shell";
import { requireActiveWorkspace } from "../../features/auth/session";
import { MemoryPageContent } from "../../features/workspace/workspace-pages";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/memory" });

  return (
    <AppShell
      activeItem="Memory"
      memberName={membership.displayName}
      memberRole={membership.role}
      title="Memory"
      workspaceName={membership.workspaceName}
    >
      <MemoryPageContent />
    </AppShell>
  );
}
