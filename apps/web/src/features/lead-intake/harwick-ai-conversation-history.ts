import type { HarwickAiConversationMessage } from "@realty-ops/core";
import type { ConversationMessageRepository, ConversationMessageRow } from "../../lib/supabase/conversation-messages";

const MAX_HISTORY_MESSAGES = 60;

function senderToActor(sender: ConversationMessageRow["sender_type"]): HarwickAiConversationMessage["actor"] {
  switch (sender) {
    case "customer":
      return "lead";
    case "ai":
      return "harwick_ai";
    case "operator":
      return "human";
    default:
      return "system";
  }
}

export async function loadAiConversationHistory(params: {
  leadId: string;
  repository: ConversationMessageRepository;
}): Promise<HarwickAiConversationMessage[]> {
  const rows = await params.repository.getMessagesByLeadId(params.leadId);
  if (rows.length === 0) {
    return [];
  }

  const trimmed = rows.length > MAX_HISTORY_MESSAGES
    ? rows.slice(rows.length - MAX_HISTORY_MESSAGES)
    : rows;

  return trimmed
    .filter((row) => row.body.trim().length > 0)
    .map((row) => ({
      id: row.id,
      actor: senderToActor(row.sender_type),
      body: row.body,
      occurredAt: row.created_at,
    }));
}
