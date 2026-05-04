import { AppShell } from "../../components/app-shell";
import { ListingsPageContent } from "../../features/listings/listings-page";
import { requireActiveWorkspace } from "../../features/auth/session";

export const dynamic = "force-dynamic";

function slugifyWorkspaceName(workspaceName: string) {
  return workspaceName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function Page() {
  const { membership } = await requireActiveWorkspace({ nextPath: "/listings" });

  return (
    <AppShell activeItem="Listings" title="Listings" workspaceName={membership.workspaceName}>
      <ListingsPageContent
        workspaceId={membership.workspaceId}
        workspaceName={membership.workspaceName}
        workspaceSlug={slugifyWorkspaceName(membership.workspaceName)}
      />
    </AppShell>
  );
}
