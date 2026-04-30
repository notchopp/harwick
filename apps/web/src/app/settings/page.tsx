import { AppShell } from "../../components/app-shell";
import { requireWorkspaceSession } from "../../features/auth/session";

export default async function Page() {
  await requireWorkspaceSession("/settings");

  return (
    <AppShell activeItem="Settings" title="Settings">
      <div className="mx-auto max-w-2xl space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Settings</h1>
          <p className="mt-2 text-muted">Manage your workspace, integrations, and preferences.</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold text-foreground">Workspace Settings</h2>
          <p className="mt-2 text-sm text-muted">Coming soon: workspace configuration, members, and billing.</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold text-foreground">Integrations</h2>
          <p className="mt-2 text-sm text-muted">Coming soon: connect Meta, Twilio, Retell, and Follow Up Boss.</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h2 className="font-display text-lg font-semibold text-foreground">Preferences</h2>
          <p className="mt-2 text-sm text-muted">Coming soon: quiet hours, notification settings, and view preferences.</p>
        </div>
      </div>
    </AppShell>
  );
}
