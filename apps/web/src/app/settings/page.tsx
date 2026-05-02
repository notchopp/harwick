import { AppShell } from "../../components/app-shell";
import { SettingsPageContent } from "../../features/settings/settings-page";
import { requireActiveWorkspace } from "../../features/auth/session";

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/settings" });

  return (
    <AppShell activeItem="Profile & Settings" title="Settings" workspaceName={membership.workspaceName}>
      <SettingsPageContent workspaceName={membership.workspaceName} />
    </AppShell>
  );
}
