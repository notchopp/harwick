import { AppShell } from "../../components/app-shell";
import { SettingsPageContent } from "../../features/settings/settings-page";
import { requireActiveWorkspace } from "../../features/auth/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/settings" });

  return (
    <AppShell activeItem="Profile & Settings" title="Settings" workspaceName={membership.workspaceName}>
      <SettingsPageContent workspaceId={membership.workspaceId} workspaceName={membership.workspaceName} />
    </AppShell>
  );
}
