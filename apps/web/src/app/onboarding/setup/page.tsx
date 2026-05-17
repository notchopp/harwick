import { redirect } from "next/navigation";

import { requireActiveWorkspace } from "../../../features/auth/session";

export const dynamic = "force-dynamic";

/**
 * Stub for ONBOARD-3 (conversational setup with the real Harwick LLM).
 * Until that ships, drop the operator straight into /home — every other
 * onboarding entry point routes through here so #104 can swap in the real
 * setup surface without re-wiring callers.
 */
export default async function Page() {
  await requireActiveWorkspace({ nextPath: "/onboarding/setup" });
  redirect("/home");
}
