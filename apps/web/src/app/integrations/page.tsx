import { AppShell } from "../../components/app-shell";
import { requireActiveWorkspace } from "../../features/auth/session";
import { loadIntegrationsPageData } from "../../features/integrations/integrations-data";
import { IntegrationsPageContent } from "../../features/integrations/integrations-page";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/integrations" });

  const data = await loadIntegrationsPageData({
    workspaceId: membership.workspaceId,
    supabase: createServerSupabaseClient(),
  });

  return (
    <AppShell activeItem="Integrations" title="Integrations" workspaceName={membership.workspaceName}>
      <IntegrationsPageContent
        data={data}
        workspaceId={membership.workspaceId}
        workspaceName={membership.workspaceName}
      />
    </AppShell>
  );
}
