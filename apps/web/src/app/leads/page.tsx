import { LeadsPageContent } from "../../features/leads/leads-page";
import { AppShell } from "../../components/app-shell";
import { requireWorkspaceSession } from "../../features/auth/session";

export default async function Page() {
  await requireWorkspaceSession("/leads");
  return (
    <AppShell activeItem="Leads" title="Leads">
      <LeadsPageContent />
    </AppShell>
  );
}
