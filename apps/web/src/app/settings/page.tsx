import { AppShell } from "../../components/app-shell";
import { SettingsPageContent } from "../../features/settings/settings-page";
import { requireActiveWorkspace } from "../../features/auth/session";
import {
  getLatestMonthlyUsageSummary,
  getWorkspaceSubscription,
  getWorkspaceUsageWallet,
} from "../../lib/supabase/billing";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";
import {
  createSupabaseVoiceAgentRepository,
  mapWorkspaceVoiceAgentRow,
} from "../../lib/supabase/voice-agents";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { session, membership } = await requireActiveWorkspace({ nextPath: "/settings" });
  const supabase = createServerSupabaseClient();
  const voiceAgentRepository = createSupabaseVoiceAgentRepository(supabase);
  const [subscription, wallet, usageSummary, voiceAgent] = await Promise.all([
    getWorkspaceSubscription(supabase, membership.workspaceId),
    getWorkspaceUsageWallet(supabase, membership.workspaceId),
    getLatestMonthlyUsageSummary(supabase, membership.workspaceId),
    voiceAgentRepository.getWorkspaceVoiceAgent(membership.workspaceId),
  ]);

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
        billingUsage={usageSummary}
        billingWallet={wallet}
        memberRole={membership.role}
        memberDisplayName={membership.displayName}
        memberEmail={session.user.email}
        voiceAgent={voiceAgent === null ? null : mapWorkspaceVoiceAgentRow(voiceAgent)}
        workspaceId={membership.workspaceId}
        workspaceName={membership.workspaceName}
      />
    </AppShell>
  );
}
