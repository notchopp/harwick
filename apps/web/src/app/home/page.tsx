import { HomePage } from "../../features/home/home-page";
import { requireWorkspaceSession } from "../../features/auth/session";

export default async function Page() {
  await requireWorkspaceSession("/home");
  return <HomePage />;
}
