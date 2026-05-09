import { AppShell } from "../../components/app-shell";
import { requireActiveWorkspace } from "../../features/auth/session";
import { ThreadsPageContent } from "../../features/workspace/workspace-pages";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/threads" });

  return (
    <AppShell
      activeItem="Threads"
      memberName={membership.displayName}
      memberRole={membership.role}
      title="Threads"
      workspaceName={membership.workspaceName}
    >
      <ThreadsPageContent />
    </AppShell>
  );
}
