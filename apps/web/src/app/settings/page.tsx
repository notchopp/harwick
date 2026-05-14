import { AppShell } from "../../components/app-shell";
import { SettingsPageContent } from "../../features/settings/settings-page";
import { requireActiveWorkspace } from "../../features/auth/session";
import { getWorkspaceSubscription } from "../../lib/supabase/billing";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { session, membership } = await requireActiveWorkspace({ nextPath: "/settings" });
  const subscription = await getWorkspaceSubscription(createServerSupabaseClient(), membership.workspaceId);

  return (
    <AppShell
      activeItem="Profile & Settings"
      memberName={membership.displayName}
      memberRole={membership.role}
      operatorRole={membership.role}
      title="Settings"
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
    >
      <SettingsPageContent
        billing={subscription === null ? null : {
          planTier: subscription.planTier,
          billingInterval: subscription.billingInterval,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          providerCustomerId: subscription.providerCustomerId,
        }}
        memberRole={membership.role}
        memberDisplayName={membership.displayName}
        memberEmail={session.user.email}
        workspaceId={membership.workspaceId}
        workspaceName={membership.workspaceName}
      />
    </AppShell>
  );
}
