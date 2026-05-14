import type { ConversationsInboxRepository } from "../../features/conversations/conversations-data";
import type {
  ConversationAiSynthesis,
  ConversationAiLiveField,
  ConversationAiToolActivity,
  ConversationAiToolActivityStatus,
} from "@realty-ops/core";
import type {
  Json,
  LeadEventRow,
  SocialReplyReviewRow,
  WorkspaceMemberRow,
} from "./database.types";
import type { ConversationMessageRow } from "./conversation-messages";
import type { LeadRow } from "./leads";
import type { RealtyOpsSupabaseClient } from "./server-client";

type LeadSynthesisRow = ConversationAiSynthesis & { leadId: string };

export type AgentStepSynthesisRow = {
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

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readToolActivityStatus(value: unknown): ConversationAiToolActivityStatus {
  if (
    value === "executed"
    || value === "queued"
    || value === "running"
    || value === "queued_for_approval"
    || value === "missing_handler"
    || value === "failed"
  ) {
    return value;
  }
  return "requested";
}

function formatLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function buildLiveFields(turn: Record<string, unknown>): ConversationAiLiveField[] {
  const statePatch = readRecord(turn["statePatch"]);
  if (statePatch === null) {
    return [];
  }

  const fields: Array<ConversationAiLiveField | null> = [
    (() => {
      const value = readString(statePatch["leadType"]);
      return value === null || value === "unknown" ? null : { key: "leadType", label: "Lead type", value: formatLabel(value) };
    })(),
    (() => {
      const value = readString(statePatch["intent"]);
      return value === null || value === "unknown" ? null : { key: "intent", label: "Intent", value: formatLabel(value) };
    })(),
    (() => {
      const value = readString(statePatch["targetArea"]);
      return value === null ? null : { key: "targetArea", label: "Area", value };
    })(),
    (() => {
      const value = readString(statePatch["timeline"]);
      return value === null ? null : { key: "timeline", label: "Timeline", value };
    })(),
    (() => {
      const value = readString(statePatch["budget"]) ?? (() => {
        const numeric = readNumber(statePatch["budget"]);
        return numeric === null ? null : String(numeric);
      })();
      return value === null ? null : { key: "budget", label: "Budget", value };
    })(),
    (() => {
      const value = readString(statePatch["propertyType"]);
      return value === null ? null : { key: "propertyType", label: "Property", value };
    })(),
    (() => {
      const value = readString(statePatch["financingStatus"]);
      return value === null || value === "unknown" ? null : { key: "financingStatus", label: "Financing", value: formatLabel(value) };
    })(),
  ];

  return fields
    .filter((field): field is ConversationAiLiveField => field !== null)
    .slice(0, 8);
}

function summarizeToolOutput(params: {
  tool: string;
  status: ConversationAiToolActivityStatus;
  reason: string | null;
  output: Record<string, unknown>;
  errorMessage: string | null;
}): { summary: string; detail: string | null } {
  if (params.status === "failed") {
    return {
      summary: `${formatLabel(params.tool)} failed`,
      detail: params.errorMessage ?? params.reason,
    };
  }

  if (params.status === "queued_for_approval") {
    return {
      summary: `${formatLabel(params.tool)} queued for approval`,
      detail: params.reason,
    };
  }

  if (params.status === "missing_handler") {
    return {
      summary: `${formatLabel(params.tool)} has no connected handler`,
      detail: params.reason,
    };
  }

  if ((params.tool === "send_meta_message" || params.tool === "send_meta_reply" || params.tool === "send_meta_dm") && readBoolean(params.output["sent"]) === true) {
    const channel = readString(params.output["channel"]);
    return {
      summary: "Reply sent",
      detail: channel === null ? params.reason : `Sent through ${formatLabel(channel)}`,
    };
  }

  if (params.tool === "route_lead" && readBoolean(params.output["routed"]) === true) {
    const assignedDisplayName = readString(params.output["assignedDisplayName"]);
    return {
      summary: assignedDisplayName === null ? "Lead routed" : `Lead routed to ${assignedDisplayName}`,
      detail: readString(params.output["reason"]) ?? params.reason,
    };
  }

  if (params.tool === "check_calendar") {
    const availableWindows = Array.isArray(params.output["availableWindows"])
      ? params.output["availableWindows"].filter((entry): entry is string => typeof entry === "string").slice(0, 2)
      : [];
    return {
      summary: "Calendar options checked",
      detail: availableWindows.length === 0 ? params.reason : `Found ${availableWindows.join("; ")}`,
    };
  }

  if (params.tool === "request_showing_approval") {
    const listing = readString(params.output["listing"]);
    return {
      summary: "Showing approval task created",
      detail: listing === null ? params.reason : `Listing: ${listing}`,
    };
  }

  if (params.tool === "register_open_house") {
    const listing = readString(params.output["listing"]);
    return {
      summary: "Open house registration task created",
      detail: listing === null ? params.reason : `Listing: ${listing}`,
    };
  }

  if (params.tool === "sync_follow_up_boss" && readBoolean(params.output["enqueued"]) === true) {
    return {
      summary: "Follow Up Boss sync queued",
      detail: params.reason,
    };
  }

  if (params.tool === "pause_automation" && readBoolean(params.output["paused"]) === true) {
    return {
      summary: "Automation paused",
      detail: readString(params.output["reason"]) ?? params.reason,
    };
  }

  if (params.tool === "dispatch_subagent" && readBoolean(params.output["queued"]) === true) {
    const subagentType = readString(params.output["subagentType"]);
    return {
      summary: subagentType === null ? "Subagent task queued" : `${formatLabel(subagentType)} subagent queued`,
      detail: readString(params.output["title"]) ?? params.reason,
    };
  }

  return {
    summary: `${formatLabel(params.tool)} ${formatLabel(params.status)}`,
    detail: params.reason,
  };
}

function mapToolExecutionActivity(row: AgentStepSynthesisRow): ConversationAiToolActivity[] {
  if (!Array.isArray(row.tool_executions)) {
    return [];
  }

  return row.tool_executions.flatMap((entry, index): ConversationAiToolActivity[] => {
    const record = readRecord(entry);
    if (record === null) return [];
    const tool = readString(record["tool"]);
    if (tool === null) return [];
    const status = readToolActivityStatus(record["status"]);
    const reason = readString(record["reason"]);
    const output = readRecord(record["output"]) ?? {};
    const errorMessage = readString(record["errorMessage"]);
    const summary = summarizeToolOutput({ tool, status, reason, output, errorMessage });

    return [{
      id: `${row.id}:tool:${index}`,
      tool,
      status,
      summary: summary.summary,
      detail: summary.detail,
    }];
  });
}

function mapRequestedToolActivity(row: AgentStepSynthesisRow): ConversationAiToolActivity[] {
  const turn = jsonRecord(row.turn_output);
  const toolCalls = Array.isArray(turn["toolCalls"]) ? turn["toolCalls"] : [];

  return toolCalls.flatMap((entry, index): ConversationAiToolActivity[] => {
    const record = readRecord(entry);
    if (record === null) return [];
    const tool = readString(record["tool"]);
    if (tool === null) return [];
    const reason = readString(record["reason"]);
    return [{
      id: `${row.id}:requested:${index}`,
      tool,
      status: "requested",
      summary: `${formatLabel(tool)} requested`,
      detail: reason,
    }];
  });
}

export function mapAgentStepToSynthesis(row: AgentStepSynthesisRow): LeadSynthesisRow | null {
  if (row.lead_id === null) return null;
  const turn = jsonRecord(row.turn_output);
  const toolCount = countToolExecutions(row.tool_executions);
  const toolActivity = mapToolExecutionActivity(row);
  const requestedToolActivity = toolActivity.length === 0 ? mapRequestedToolActivity(row) : [];
  const nextAction = readString(turn["nextAction"]) ?? readString(turn["next_action"]) ?? "working";
  const handoffBrief = readString(turn["handoffBrief"])
    ?? (toolActivity.length > 0
      ? toolActivity.map((activity) => activity.summary).join(" · ")
      : (toolCount > 0 ? `Harwick is processing ${toolCount} tool result${toolCount === 1 ? "" : "s"}.` : null));

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
    liveFields: buildLiveFields(turn),
    toolActivity: [...toolActivity, ...requestedToolActivity].slice(0, 12),
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
    liveFields: [],
    toolActivity: [{
      id: `${row.id}:subagent`,
      tool: "dispatch_subagent",
      status: row.status === "queued" ? "queued" : "running",
      summary: `${formatLabel(row.subagent_type)} subagent ${formatLabel(row.status)}`,
      detail: row.title,
    }],
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

    async listConversationMessages(params) {
      if (params.leadIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from("conversation_messages")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .in("lead_id", params.leadIds)
        .order("created_at", { ascending: true })
        .limit(params.limit)
        .returns<ConversationMessageRow[]>();

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
          liveFields: buildLiveFields(turn),
          toolActivity: [],
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
