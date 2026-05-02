import type { ConversationAutomationMode } from "@realty-ops/core";
import type { ConversationAutomationStateRow } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

export async function findConversationAutomationMode(params: {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  leadId?: string | null;
  providerAccountId?: string | null;
  recipientUserId?: string | null;
  channel?: "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment" | null;
}): Promise<ConversationAutomationMode> {
  let query = params.supabase
    .from("conversation_automation_states")
    .select("*")
    .eq("workspace_id", params.workspaceId);

  if (params.leadId !== undefined && params.leadId !== null) {
    query = query.eq("lead_id", params.leadId);
  } else if (
    params.providerAccountId !== undefined
    && params.providerAccountId !== null
    && params.channel !== undefined
    && params.channel !== null
  ) {
    query = query
      .is("lead_id", null)
      .eq("provider_account_id", params.providerAccountId)
      .eq("channel", params.channel);

    query = params.recipientUserId === undefined || params.recipientUserId === null
      ? query.is("recipient_user_id", null)
      : query.eq("recipient_user_id", params.recipientUserId);
  } else {
    return "ai_on";
  }

  const { data, error } = await query.maybeSingle<ConversationAutomationStateRow>();
  if (error !== null) {
    throw error;
  }

  return data?.automation_mode ?? "ai_on";
}
