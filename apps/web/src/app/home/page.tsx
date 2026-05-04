import { HomePage } from "../../features/home/home-page";
import { requireActiveWorkspace } from "../../features/auth/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { session, membership } = await requireActiveWorkspace({ nextPath: "/home" });

  return (
    <HomePage
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
      operatorName={membership.displayName ?? session.user.email ?? "Operator"}
      operatorRole={membership.role}
      operatorMemberId={membership.memberId}
    />
  );
}
