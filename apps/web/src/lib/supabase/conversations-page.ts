import type { ConversationsInboxRepository } from "../../features/conversations/conversations-data";
import type { ConversationAiSynthesis } from "@realty-ops/core";
import type {
  Json,
  LeadEventRow,
  SocialReplyReviewRow,
  WorkspaceMemberRow,
} from "./database.types";
import type { LeadRow } from "./leads";
import type { RealtyOpsSupabaseClient } from "./server-client";

type LeadSynthesisRow = ConversationAiSynthesis & { leadId: string };

type AgentStepSynthesisRow = {
  id: string;
  lead_id: string | null;
  turn_output: Json;
  tool_executions: Json;
  exit_reason: string | null;
  harwick_ai_turn_id: string | null;
  created_at: string;
};

type SubagentTaskSynthesisRow = {
  id: string;
  lead_id: string | null;
  subagent_type: string;
  status: string;
  priority: string;
  title: string;
  instructions: string;
  updated_at: string;
};

function jsonRecord(value: Json): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function countToolExecutions(value: Json): number {
  return Array.isArray(value) ? value.length : 0;
}

function mapAgentStepToSynthesis(row: AgentStepSynthesisRow): LeadSynthesisRow | null {
  if (row.lead_id === null) return null;
  const turn = jsonRecord(row.turn_output);
  const toolCount = countToolExecutions(row.tool_executions);
  const nextAction = readString(turn["nextAction"]) ?? readString(turn["next_action"]) ?? "working";
  const handoffBrief = readString(turn["handoffBrief"])
    ?? (toolCount > 0 ? `Harwick is processing ${toolCount} tool result${toolCount === 1 ? "" : "s"}.` : null);

  return {
    leadId: row.lead_id,
    turnId: row.harwick_ai_turn_id ?? row.id,
    status: row.exit_reason === null ? "in_flight" : `in_flight:${row.exit_reason}`,
    intent: readString(turn["intent"]) ?? "working",
    nextAction,
    confidence: Math.max(0, Math.min(1, readNumber(turn["confidence"]) ?? 0.6)),
    missingFields: readStringArray(turn["missingFields"]),
    safetyFlags: [...new Set(["in_flight", ...readStringArray(turn["safetyFlags"])])],
    handoffBrief,
    documentUpdate: readString(turn["documentUpdate"]),
    updatedAt: row.created_at,
  };
}

function mapSubagentTaskToSynthesis(row: SubagentTaskSynthesisRow): LeadSynthesisRow | null {
  if (row.lead_id === null) return null;
  return {
    leadId: row.lead_id,
    turnId: row.id,
    status: `subagent_${row.status}`,
    intent: `${row.subagent_type}_subagent`,
    nextAction: row.title,
    confidence: row.priority === "urgent" ? 0.75 : 0.65,
    missingFields: [],
    safetyFlags: ["in_flight", "subagent_task"],
    handoffBrief: row.instructions,
    documentUpdate: null,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseConversationsInboxRepository(
  supabase: RealtyOpsSupabaseClient,
): ConversationsInboxRepository {
  return {
    async listLeads(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .not("last_message_at", "is", null)
        .neq("status", "archived")
        .order("last_message_at", { ascending: false })
        .limit(params.limit)
        .returns<LeadRow[]>();

      if (error !== null) {
        throw error;
      }

      console.log("[CONVERSATIONS DEBUG]", {
        workspaceId: params.workspaceId,
        foundCount: (data ?? []).length,
        leads: data?.map(d => ({
          id: d.id,
          last_message_at: d.last_message_at,
          status: d.status,
          instagram_user_id: d.instagram_user_id,
        })),
      });

      return data ?? [];
    },

    async listWorkspaceMembers(workspaceId) {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("id,display_name")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .returns<Array<Pick<WorkspaceMemberRow, "id" | "display_name">>>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async listLeadEvents(params) {
      if (params.leadIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("lead_events")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .in("lead_id", params.leadIds)
        .order("occurred_at", { ascending: true })
        .limit(params.limit)
        .returns<LeadEventRow[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async listSocialReplyReviews(params) {
      if (params.leadIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("social_reply_reviews")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .in("lead_id", params.leadIds)
        .order("updated_at", { ascending: false })
        .returns<SocialReplyReviewRow[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async listConversationAutomationStates(params) {
      if (params.leadIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("conversation_automation_states")
        .select("lead_id, automation_mode")
        .eq("workspace_id", params.workspaceId)
        .in("lead_id", params.leadIds)
        .not("lead_id", "is", null)
        .returns<Array<{ lead_id: string | null; automation_mode: string }>>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map((row) => ({
        leadId: row.lead_id,
        automationMode: row.automation_mode,
      }));
    },

    async listLatestAiSynthesis(params) {
      if (params.leadIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("harwick_ai_turns")
        .select("id, lead_id, status, turn, next_action, confidence, missing_fields, safety_flags, handoff_brief, created_at")
        .eq("workspace_id", params.workspaceId)
        .in("lead_id", params.leadIds)
        .order("created_at", { ascending: false })
        .limit(Math.max(params.leadIds.length * 3, params.leadIds.length))
        .returns<Array<{
          id: string;
          lead_id: string | null;
          status: string;
          turn: Json;
          next_action: string;
          confidence: number;
          missing_fields: string[];
          safety_flags: string[];
          handoff_brief: string | null;
          created_at: string;
        }>>();

      if (error !== null) {
        throw error;
      }

      const seen = new Set<string>();
      return (data ?? []).flatMap((row) => {
        if (row.lead_id === null || seen.has(row.lead_id)) {
          return [];
        }
        seen.add(row.lead_id);

        const turn = typeof row.turn === "object" && row.turn !== null && !Array.isArray(row.turn)
          ? row.turn
          : {};
        const intent = typeof turn["intent"] === "string" && turn["intent"].trim().length > 0
          ? turn["intent"]
          : "unknown";
        const documentUpdate = typeof turn["documentUpdate"] === "string" && turn["documentUpdate"].trim().length > 0
          ? turn["documentUpdate"].trim()
          : null;

        return [{
          leadId: row.lead_id,
          turnId: row.id,
          status: row.status,
          intent,
          nextAction: row.next_action,
          confidence: row.confidence,
          missingFields: row.missing_fields,
          safetyFlags: row.safety_flags,
          handoffBrief: row.handoff_brief,
          documentUpdate,
          updatedAt: row.created_at,
        }];
      });
    },

    async listInFlightAiSynthesis(params) {
      if (params.leadIds.length === 0) {
        return [];
      }

      const [stepsResult, subagentResult] = await Promise.all([
        supabase
          .from("agent_steps")
          .select("id, lead_id, turn_output, tool_executions, exit_reason, harwick_ai_turn_id, created_at")
          .eq("workspace_id", params.workspaceId)
          .in("lead_id", params.leadIds)
          .order("created_at", { ascending: false })
          .limit(Math.max(params.leadIds.length * 3, params.leadIds.length))
          .returns<AgentStepSynthesisRow[]>(),
        supabase
          .from("harwick_subagent_tasks")
          .select("id, lead_id, subagent_type, status, priority, title, instructions, updated_at")
          .eq("workspace_id", params.workspaceId)
          .in("lead_id", params.leadIds)
          .in("status", ["queued", "running"])
          .order("updated_at", { ascending: false })
          .limit(Math.max(params.leadIds.length * 3, params.leadIds.length))
          .returns<SubagentTaskSynthesisRow[]>(),
      ]);

      if (stepsResult.error !== null) {
        throw stepsResult.error;
      }
      if (subagentResult.error !== null) {
        throw subagentResult.error;
      }

      return [
        ...(stepsResult.data ?? []).map(mapAgentStepToSynthesis),
        ...(subagentResult.data ?? []).map(mapSubagentTaskToSynthesis),
      ].filter((entry): entry is LeadSynthesisRow => entry !== null);
    },
  };
}
