import { AppShell } from "../../components/app-shell";
import { loadWorkspaceActivity } from "../../features/activity/activity-data";
import { ActivityPageContent } from "../../features/activity/activity-page";
import { requireActiveWorkspace } from "../../features/auth/session";
import { createSupabaseWorkspaceActivityRepository } from "../../lib/supabase/activity";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/activity" });
  const activity = await loadWorkspaceActivity({
    workspaceId: membership.workspaceId,
    repository: createSupabaseWorkspaceActivityRepository(createServerSupabaseClient()),
  });

  return (
    <AppShell
      activeItem="Activity Log"
      memberName={membership.displayName}
      memberRole={membership.role}
      title="Activity Log"
      workspaceName={membership.workspaceName}
    >
      <ActivityPageContent events={activity.events} workspaceName={membership.workspaceName} />
    </AppShell>
  );
}
