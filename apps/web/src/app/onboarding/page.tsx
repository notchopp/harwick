import { redirect } from "next/navigation";

import { getCookieAuthSessionSummary } from "../../features/auth/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getCookieAuthSessionSummary();
  if (session === null) {
    redirect("/login?next=/onboarding");
  }

  if (session.memberships.length > 0) {
    redirect("/home");
  }

  redirect("/onboarding/plan-pick");
}
