import { redirect } from "next/navigation";
import { LoginPage } from "../../features/auth/login-page";
import { getCookieAuthSessionSummary } from "../../features/auth/session";
import { normalizeAuthRedirect } from "../../features/auth/redirects";

export const dynamic = "force-dynamic";

export default async function Page(props: {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const nextPath = normalizeAuthRedirect(searchParams.next ?? null);
  const session = await getCookieAuthSessionSummary();
  if (session !== null && session.memberships.length > 0) {
    redirect(nextPath);
  }

  return <LoginPage error={searchParams.error ?? null} next={nextPath} />;
}
