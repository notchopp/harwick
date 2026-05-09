import { requireActiveWorkspace } from "../../features/auth/session";
import { QueuePage } from "../../features/queue/queue-page";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { session, membership } = await requireActiveWorkspace({ nextPath: "/queue" });

  return (
    <QueuePage
      operatorName={membership.displayName ?? session.user.email ?? "Operator"}
      operatorRole={membership.role}
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
    />
  );
}
