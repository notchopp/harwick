import { AppShell } from "../../components/app-shell";
import { ConversationsPageContent } from "../../features/conversations/conversations-page";
import { requireWorkspaceSession } from "../../features/auth/session";

export default async function Page() {
  await requireWorkspaceSession("/conversations");
  return (
    <AppShell activeItem="Conversations" title="Conversations">
      <ConversationsPageContent />
    </AppShell>
  );
}
