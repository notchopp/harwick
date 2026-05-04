import { AppShell } from "../../components/app-shell";
import { ActivityPageContent } from "../../features/activity/activity-page";
import { requireActiveWorkspace } from "../../features/auth/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/activity" });

  return (
    <AppShell activeItem="Activity Log" title="Activity Log" workspaceName={membership.workspaceName}>
      <ActivityPageContent workspaceName={membership.workspaceName} />
    </AppShell>
  );
}
