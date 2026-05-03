import { AppShell } from "../../components/app-shell";
import { ConversationsPageContent } from "../../features/conversations/conversations-page";
import { requireActiveWorkspace } from "../../features/auth/session";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/conversations" });

  return (
    <AppShell activeItem="Conversations" title="Conversations" workspaceName={membership.workspaceName}>
      <ConversationsPageContent
        workspaceId={membership.workspaceId}
        workspaceName={membership.workspaceName}
        currentMemberId={membership.memberId}
      />
    </AppShell>
  );
}
