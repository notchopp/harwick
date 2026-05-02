import { HomePage } from "../../features/home/home-page";
import { requireActiveWorkspace } from "../../features/auth/session";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/home" });

  return <HomePage workspaceId={membership.workspaceId} workspaceName={membership.workspaceName} />;
}
