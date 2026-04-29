import { handleRetellCallContext } from "../../../features/call-intake/retell-context";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";
import { createSupabaseVoiceAgentRepository } from "../../../lib/supabase/voice-agents";

export async function postRetellContext(params: {
  body: unknown;
}) {
  return handleRetellCallContext({
    body: params.body,
    repository: createSupabaseVoiceAgentRepository(createServerSupabaseClient()),
  });
}
