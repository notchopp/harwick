import { redirect } from "next/navigation";
import { SignupPage } from "../../features/auth/signup-page";
import { getCookieAuthSessionSummary } from "../../features/auth/session";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getCookieAuthSessionSummary();
  if (session !== null && session.memberships.length > 0) {
    redirect("/home");
  }

  if (session !== null) {
    redirect("/onboarding");
  }

  return <SignupPage />;
}
