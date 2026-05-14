import { requireActiveWorkspace } from "../../features/auth/session";
import { VoiceShell } from "../../features/voice/voice-shell";

export const dynamic = "force-dynamic";

export default async function Page(props: {
  searchParams: Promise<{ q?: string | string[]; voice?: string | string[] }>;
}) {
  const params = await props.searchParams;
  const { session, membership } = await requireActiveWorkspace({ nextPath: "/v" });

  const rawQ = params.q;
  const initialQuery = typeof rawQ === "string" && rawQ.trim().length > 0 ? rawQ.trim() : null;
  const rawVoice = params.voice;
  const autoStart = (typeof rawVoice === "string" && rawVoice === "1")
    || (Array.isArray(rawVoice) && rawVoice.includes("1"));

  const operatorName = membership.displayName ?? session.user.email ?? "Operator";

  return (
    <VoiceShell
      workspaceId={membership.workspaceId}
      workspaceName={membership.workspaceName}
      operatorName={operatorName}
      initialQuery={initialQuery}
      autoStart={autoStart}
    />
  );
}
