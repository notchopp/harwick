import type { HarwickToolDefinition } from "../registry";
import { LEAD_CONVERSATION_ACTION_TOOLS } from "./actions";

// Lead-conversation tool registry. Composed of:
//   1. Lead-specific action tools defined in actions.ts (send_meta_message,
//      route_lead, request_showing_approval, etc.) — these PROPOSE actions
//      that the existing executor pipeline runs through approval gating.
//   2. Read-only tools from operator-chat that are also scoped to
//      "lead_conversation" — recall_fact, find_similar_leads, search_listings,
//      find_comps, summarize_call_recording, query_workspace, update_lead_stage,
//      record_lead_note, update_qualification_summary, etc.
//
// The operator-chat tools that have "lead_conversation" in their scopes array
// are picked up automatically by buildHarwickToolsForScope; this registry only
// needs the lead-specific action tools.
export const LEAD_CONVERSATION_REGISTRY: HarwickToolDefinition[] = [
  ...LEAD_CONVERSATION_ACTION_TOOLS,
];

export { LEAD_CONVERSATION_ACTION_TOOLS };
