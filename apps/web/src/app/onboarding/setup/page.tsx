import { redirect } from "next/navigation";

import { requireActiveWorkspace } from "../../../features/auth/session";
import { OnboardingSetupPage } from "../../../features/onboarding/setup-page";
import { getWorkspaceSubscription } from "../../../lib/supabase/billing";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";
import { getWorkspaceOnboardingState } from "../../../lib/supabase/workspace-onboarding";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { session, membership } = await requireActiveWorkspace({
    nextPath: "/onboarding/setup",
    skipOnboardingCheck: true,
  });

  const supabase = createServerSupabaseClient();
  const [state, subscription] = await Promise.all([
    getWorkspaceOnboardingState(supabase, membership.workspaceId),
    getWorkspaceSubscription(supabase, membership.workspaceId),
  ]);

  // Already finished — only bounce to /home if the operator didn't ask to
  // re-run. ?reset=1 lets them step back through setup intentionally (e.g.
  // to refresh reply examples or change channel intent).
  const params = await searchParams;
  const forceReset = params.reset === "1" || params.reset === "true";
  if (state.completedAt !== null && !forceReset) {
    redirect("/home");
  }

  // When re-running, present the operator with a blank-slate state so the
  // chat starts at the first beat and the progress strip reads empty.
  const renderState = forceReset
    ? {
        ...state,
        identityDone: false,
        replyExamplesDone: false,
        channelIntentDone: false,
        completedAt: null,
      }
    : state;

  const planTier = subscription?.planTier ?? "free";

  return (
    <OnboardingSetupPage
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
      operatorName={membership.displayName ?? session.user.email ?? "Operator"}
      operatorRole={membership.role}
      planTier={planTier}
      initialState={renderState}
    />
  );
}
