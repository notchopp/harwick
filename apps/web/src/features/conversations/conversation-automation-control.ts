import { ConversationAutomationControlRequestSchema } from "@realty-ops/core";
import type { ConversationAutomationRepository } from "../../lib/supabase/conversation-automation";

export type ConversationAutomationControlResponse = {
  conversationId: string;
  mode: "ai_on" | "human_takeover" | "paused_by_rule";
  reason: string | null;
  changedAt: string;
};

export async function updateConversationAutomation(params: {
  workspaceId: string;
  conversationId: string;
  memberId: string;
  request: unknown;
  repository: ConversationAutomationRepository;
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

  const lead = await params.repository.findLeadByConversationId(params.conversationId);
  if (lead === null) {
    return {
      status: 404,
      body: { error: "conversation_not_found" },
    };
  }

  if (lead.workspace_id !== params.workspaceId) {
    return {
      status: 403,
      body: { error: "forbidden" },
    };
  }

  const changedAt = (params.now?.() ?? new Date()).toISOString();
  const reason = parsed.data.reason ?? null;
  const existingState = await params.repository.findAutomationState({
    workspaceId: params.workspaceId,
    leadId: lead.id,
  });

  if (existingState === null) {
    await params.repository.insertAutomationState({
      workspaceId: params.workspaceId,
      leadId: lead.id,
      automationMode: parsed.data.mode,
      automationReason: reason,
      changedByMemberId: params.memberId,
      changedAt,
    });
  } else {
    await params.repository.updateAutomationState({
      stateId: existingState.id,
      automationMode: parsed.data.mode,
      automationReason: reason,
      changedByMemberId: params.memberId,
      changedAt,
    });
  }

  return {
    status: 200,
    body: {
      conversationId: lead.id,
      mode: parsed.data.mode,
      reason,
      changedAt,
    },
  };
}
