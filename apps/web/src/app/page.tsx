import { redirect } from "next/navigation";
import { getCookieAuthSessionSummary } from "../features/auth/session";

export const dynamic = "force-dynamic";

export default async function RootPage() {
  const session = await getCookieAuthSessionSummary();
  redirect(session === null || session.memberships.length === 0 ? "/login" : "/home");
}
