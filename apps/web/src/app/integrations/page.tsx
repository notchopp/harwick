import { AppShell } from "../../components/app-shell";
import { requireActiveWorkspace } from "../../features/auth/session";
import { loadIntegrationsPageData } from "../../features/integrations/integrations-data";
import { IntegrationsPageContent } from "../../features/integrations/integrations-page";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/integrations" });

  const data = await loadIntegrationsPageData({
    workspaceId: membership.workspaceId,
    supabase: createServerSupabaseClient(),
  });

  return (
    <AppShell
      activeItem="Integrations"
      memberName={membership.displayName}
      memberRole={membership.role}
      operatorRole={membership.role}
      title="Integrations"
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
    >
      <IntegrationsPageContent
        data={data}
        workspaceId={membership.workspaceId}
        workspaceName={membership.workspaceName}
      />
    </AppShell>
  );
}
