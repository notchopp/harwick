import { MarketingLandingPage } from "../features/marketing/landing-page";
import { getCookieAuthSessionSummary } from "../features/auth/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "harwick - AI chief of staff for real estate teams",
  description:
    "Harwick captures inbound real estate demand, qualifies leads, proposes the next action, and gates every external write until an operator approves it.",
};

export default async function RootPage() {
  const session = await getCookieAuthSessionSummary();
  const isAuthenticated = session !== null && session.memberships.length > 0;
  return <MarketingLandingPage isAuthenticated={isAuthenticated} />;
}
