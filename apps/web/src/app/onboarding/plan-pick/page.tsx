import { redirect } from "next/navigation";

import { getCookieAuthSessionSummary } from "../../../features/auth/session";
import { PlanPickPage } from "../../../features/onboarding/plan-pick-page";

export const dynamic = "force-dynamic";

function defaultWorkspaceNameFromEmail(email: string | null | undefined): string {
  if (email === null || email === undefined || email.length === 0) {
    return "";
  }
  const local = email.split("@")[0] ?? "";
  if (local.length === 0) {
    return "";
  }
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function Page() {
  const session = await getCookieAuthSessionSummary();
  if (session === null) {
    redirect("/login?next=/onboarding/plan-pick");
  }
  if (session.memberships.length > 0) {
    redirect("/home");
  }

  const defaultName = defaultWorkspaceNameFromEmail(session.user.email ?? null);

  return <PlanPickPage defaultWorkspaceName={defaultName} />;
}
