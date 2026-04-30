import { AppShell } from "../../components/app-shell";
import { ListingsPageContent } from "../../features/listings/listings-page";
import { requireWorkspaceSession } from "../../features/auth/session";

export default async function Page() {
  await requireWorkspaceSession("/listings");
  return (
    <AppShell activeItem="Listings" title="Listings">
      <ListingsPageContent />
    </AppShell>
  );
}
