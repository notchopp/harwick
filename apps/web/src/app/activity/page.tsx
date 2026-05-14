import { AppShell } from "../../components/app-shell";
import { loadWorkspaceActivity } from "../../features/activity/activity-data";
import { ActivityPageContent } from "../../features/activity/activity-page";
import { loadProductUpdates } from "../../features/activity/product-updates";
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
  const productUpdates = await loadProductUpdates({ limit: 4 });

  return (
    <AppShell
      activeItem="Activity Log"
      memberName={membership.displayName}
      memberRole={membership.role}
      operatorRole={membership.role}
      title="Activity Log"
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
    >
      <ActivityPageContent
        events={activity.events}
        productUpdates={productUpdates.feed.updates}
        productUpdatesError={productUpdates.error}
        workspaceName={membership.workspaceName}
      />
    </AppShell>
  );
}
