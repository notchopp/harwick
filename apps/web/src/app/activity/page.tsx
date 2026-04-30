import { AppShell } from "../../components/app-shell";
import { ActivityPageContent } from "../../features/activity/activity-page";
import { requireWorkspaceSession } from "../../features/auth/session";

export default async function Page() {
  await requireWorkspaceSession("/activity");
  return (
    <AppShell activeItem="Activity Log" title="Activity Log">
      <ActivityPageContent />
    </AppShell>
  );
}
