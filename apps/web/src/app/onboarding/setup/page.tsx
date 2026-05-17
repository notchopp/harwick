import { redirect } from "next/navigation";

import { requireActiveWorkspace } from "../../../features/auth/session";
import { OnboardingSetupPage } from "../../../features/onboarding/setup-page";
import { getWorkspaceSubscription } from "../../../lib/supabase/billing";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";
import { getWorkspaceOnboardingState } from "../../../lib/supabase/workspace-onboarding";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { session, membership } = await requireActiveWorkspace({ nextPath: "/onboarding/setup" });

  const supabase = createServerSupabaseClient();
  const [state, subscription] = await Promise.all([
    getWorkspaceOnboardingState(supabase, membership.workspaceId),
    getWorkspaceSubscription(supabase, membership.workspaceId),
  ]);

  // Operator already finished setup once — drop them straight into /home.
  if (state.completedAt !== null) {
    redirect("/home");
  }

  const planTier = (subscription?.planTier ?? "free") as "free" | "solo" | "team" | "brokerage";

  return (
    <OnboardingSetupPage
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
      operatorName={membership.displayName ?? session.user.email ?? "Operator"}
      planTier={planTier}
      initialState={state}
    />
  );
}
