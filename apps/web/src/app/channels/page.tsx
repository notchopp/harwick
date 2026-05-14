import { AppShell } from "../../components/app-shell";
import { ChannelsPage } from "../../features/channels/channels-page";
import { requireActiveWorkspace } from "../../features/auth/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/channels" });

  return (
    <AppShell
      activeItem="Channels"
      memberName={membership.displayName}
      memberRole={membership.role}
      operatorRole={membership.role}
      title="Channels"
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
    >
      <ChannelsPage
        workspaceId={membership.workspaceId}
        workspaceName={membership.workspaceName}
        currentMemberId={membership.memberId}
        operatorRole={membership.role}
      />
    </AppShell>
  );
}
