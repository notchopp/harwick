import { ConversationAutomationControlRequestSchema } from "@realty-ops/core";
import type { ConversationRepository } from "../../lib/supabase/conversations";

export type ConversationAutomationControlResponse = {
  conversationId: string;
  leadId: string;
  mode: "ai_on" | "human_takeover" | "paused_by_rule";
  reason: string | null;
  changedAt: string;
};

export async function updateConversationAutomationUnified(params: {
  workspaceId: string;
  leadId: string;
  memberId: string;
  request: unknown;
  repository: ConversationRepository;
  now?: () => Date;
}): Promise<
  | { status: 200; body: ConversationAutomationControlResponse }
  | { status: 400 | 403 | 404; body: { error: string } }
> {
  const parsed = ConversationAutomationControlRequestSchema.safeParse(params.request);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "invalid_request" },
    };
  }

  const changedAt = (params.now?.() ?? new Date()).toISOString();
  const reason = parsed.data.reason ?? null;

  try {
    const conversation = await params.repository.updateConversationAutomation({
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      automationMode: parsed.data.mode,
      automationReason: reason,
      changedByMemberId: params.memberId,
      changedAt,
    });

    return {
      status: 200,
      body: {
        conversationId: conversation.id,
        leadId: conversation.lead_id,
        mode: conversation.automation_mode,
        reason: conversation.automation_reason,
        changedAt: conversation.automation_changed_at ?? changedAt,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes("not found") || errorMessage.includes("unique")) {
      return {
        status: 404,
        body: { error: "conversation_not_found" },
      };
    }

    throw error;
  }
}
