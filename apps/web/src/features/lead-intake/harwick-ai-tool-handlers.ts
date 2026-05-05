import type {
  HarwickAiToolCall,
  HarwickAiToolName,
  NormalizedLeadEvent,
} from "@realty-ops/core";
import { decideLeadRouting } from "@realty-ops/core";
import type { HarwickAiToolHandlers } from "@realty-ops/integrations";
import { createMetaMessagingClient } from "@realty-ops/integrations";
import type { ConversationMessageRepository } from "../../lib/supabase/conversation-messages";
import type { ConversationAutomationRepository } from "../../lib/supabase/conversation-automation";
import type { LeadEventPersistenceRepository } from "../../lib/supabase/lead-events";
import type { MemberRoutingProfileRepository } from "../../lib/supabase/member-routing-profiles";
import { mapRowToAgentRoutingProfile } from "../../lib/supabase/member-routing-profiles";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import type { LeadRow } from "../../lib/supabase/leads";
import type { Json, TablesInsert, TablesUpdate } from "../../lib/supabase/database.types";
import { sendMetaReply } from "../integrations/meta-reply-send";
import { createSupabaseMetaCredentialRepository } from "../../lib/supabase/integration-accounts";

export type HarwickAiToolContext = {
  workspaceId: string;
  leadId: string;
  leadEventId: string | null;
  event: NormalizedLeadEvent;
  lead: LeadRow | null;
  channel: "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment";
  providerAccountId: string;
  recipientUserId: string;
  sourcePostId: string | null;
  sourceCommentId: string | null;
  automationMode: "ai_on" | "human_takeover" | "human_review";
  /** Trajectory + step IDs threaded into outbound conversation_messages so operator inline-tags attribute to the exact (state, action) pair. */
  agentTrajectoryId: string | null;
  agentStepId: string | null;
};

export type HarwickAiToolHandlerDependencies = {
  supabase: RealtyOpsSupabaseClient;
  context: HarwickAiToolContext;
  conversationMessageRepository: ConversationMessageRepository;
  conversationAutomationRepository: ConversationAutomationRepository;
  leadEventRepository: LeadEventPersistenceRepository;
  memberRoutingRepository: MemberRoutingProfileRepository;
  credentialSecret: string;
};

function readPayloadString(toolCall: HarwickAiToolCall, key: string): string | null {
  const value = toolCall.payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readPayloadPriority(toolCall: HarwickAiToolCall): "low" | "normal" | "high" | "urgent" {
  const value = readPayloadString(toolCall, "priority");
  return value === "low" || value === "high" || value === "urgent" ? value : "normal";
}

function readSubagentType(toolCall: HarwickAiToolCall): "research" | "writer" | "calendar" | "routing" {
  const value = readPayloadString(toolCall, "subagentType") ?? readPayloadString(toolCall, "type");
  if (value === "writer" || value === "calendar" || value === "routing") return value;
  return "research";
}

/**
 * Synthesize availability windows when no real calendar integration exists.
 * Returns the next 3 business days × {10am, 2pm, 4pm}. When Google Calendar
 * lands (paid-launch-map item 8), this synthesis is replaced by a real lookup.
 */
function synthesizeAvailableWindows(now: Date = new Date()): string[] {
  const windows: string[] = [];
  const slots = ["10:00 AM", "2:00 PM", "4:00 PM"];
  let added = 0;
  for (let dayOffset = 1; added < 9 && dayOffset < 14; dayOffset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + dayOffset);
    const dow = candidate.getDay();
    if (dow === 0 || dow === 6) continue;
    const label = candidate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    for (const slot of slots) {
      windows.push(`${label} at ${slot}`);
      added += 1;
    }
  }
  return windows;
}

export function createHarwickAiToolHandlers(
  deps: HarwickAiToolHandlerDependencies,
): HarwickAiToolHandlers {
  const handlers: HarwickAiToolHandlers = {};

  const sendMetaTool = async (toolCall: HarwickAiToolCall): Promise<Record<string, unknown>> => {
    const reply = readPayloadString(toolCall, "reply");
    if (reply === null) {
      return { sent: false, reason: "missing_reply_payload" };
    }

    const result = await sendMetaReply({
      request: {
        workspaceId: deps.context.workspaceId,
        leadId: deps.context.leadId,
        providerAccountId: deps.context.providerAccountId,
        channel: deps.context.channel,
        recipientUserId: deps.context.recipientUserId,
        sourceCommentId: deps.context.sourceCommentId,
        sourcePostId: deps.context.sourcePostId,
        reply,
        automationMode: deps.context.automationMode,
      },
      credentialSecret: deps.credentialSecret,
      credentialRepository: createSupabaseMetaCredentialRepository(deps.supabase),
      leadEventRepository: deps.leadEventRepository,
      metaClient: createMetaMessagingClient(),
      conversationMessageRepository: deps.conversationMessageRepository,
      senderType: "ai",
      agentTrajectoryId: deps.context.agentTrajectoryId,
      agentStepId: deps.context.agentStepId,
    });

    if (result.status === 200) {
      return {
        sent: true,
        providerEventId: result.body.providerEventId,
        occurredAt: result.body.occurredAt,
        channel: result.body.channel,
        reply,
      };
    }
    return { sent: false, reason: result.body.error };
  };

  handlers["send_meta_reply"] = sendMetaTool;
  handlers["send_meta_dm"] = sendMetaTool;

  handlers["check_calendar"] = async (toolCall) => {
    const requestedListing = readPayloadString(toolCall, "listing");
    const assignedAgentId = deps.context.lead?.assigned_agent_id ?? null;
    let agentName: string | null = null;
    const availableWindows = synthesizeAvailableWindows();

    if (assignedAgentId !== null) {
      const profile = await deps.memberRoutingRepository.findProfileByMemberId({
        workspaceId: deps.context.workspaceId,
        memberId: assignedAgentId,
      });
      if (profile !== null) {
        agentName = profile.role_label;
      }
    }

    // No real calendar integration yet — synthesize next-business-days slots
    // so the model has something concrete to offer. Replaced by a real
    // Google Calendar lookup once shift 8 (calendar) lands.
    return {
      assignedAgentId,
      agentName,
      requestedListing,
      availableWindows: availableWindows.slice(0, 6),
      synthesized: true,
      note: "Calendar integration is not yet connected. These windows are synthesized; confirm with the agent before promising.",
    };
  };

  handlers["request_showing_approval"] = async (toolCall) => {
    const occurredAt = new Date().toISOString();
    const listing = readPayloadString(toolCall, "listing");
    const requestedTime = readPayloadString(toolCall, "requestedTime") ?? readPayloadString(toolCall, "time");
    const insert: TablesInsert<"lead_tasks"> = {
      workspace_id: deps.context.workspaceId,
      lead_id: deps.context.leadId,
      listing_id: null,
      task_type: "request_showing_approval",
      status: "open",
      priority: "high",
      title: listing === null ? "Showing approval requested" : `Showing approval: ${listing}`,
      description: [
        `Harwick AI requested a showing.${listing === null ? "" : ` Listing: ${listing}.`}`,
        requestedTime === null ? "" : `Requested time: ${requestedTime}.`,
        `Reason: ${toolCall.reason}`,
      ].filter((line) => line.length > 0).join("\n"),
      assigned_member_id: deps.context.lead?.assigned_agent_id ?? null,
      created_at: occurredAt,
      updated_at: occurredAt,
    };

    const { data, error } = await deps.supabase
      .from("lead_tasks")
      .insert(insert)
      .select("id")
      .single<{ id: string }>();

    if (error !== null) {
      throw error;
    }

    return {
      taskId: data.id,
      status: "queued",
      listing,
      requestedTime,
    };
  };

  handlers["register_open_house"] = async (toolCall) => {
    const occurredAt = new Date().toISOString();
    const listing = readPayloadString(toolCall, "listing");
    const eventDate = readPayloadString(toolCall, "eventDate") ?? readPayloadString(toolCall, "date");
    const insert: TablesInsert<"lead_tasks"> = {
      workspace_id: deps.context.workspaceId,
      lead_id: deps.context.leadId,
      listing_id: null,
      task_type: "open_house_registration",
      status: "open",
      priority: "normal",
      title: listing === null ? "Open house registration" : `Open house: ${listing}`,
      description: [
        `Harwick AI registered the lead for an open house.`,
        listing === null ? "" : `Listing: ${listing}.`,
        eventDate === null ? "" : `Event date: ${eventDate}.`,
        `Reason: ${toolCall.reason}`,
      ].filter((line) => line.length > 0).join("\n"),
      assigned_member_id: deps.context.lead?.assigned_agent_id ?? null,
      created_at: occurredAt,
      updated_at: occurredAt,
    };

    const { data, error } = await deps.supabase
      .from("lead_tasks")
      .insert(insert)
      .select("id")
      .single<{ id: string }>();

    if (error !== null) {
      throw error;
    }

    return { taskId: data.id, status: "registered", listing, eventDate };
  };

  handlers["route_lead"] = async (toolCall) => {
    const lead = deps.context.lead;
    if (lead === null) {
      return { routed: false, reason: "lead_not_found" };
    }

    const profiles = await deps.memberRoutingRepository.listProfilesForWorkspace(deps.context.workspaceId);
    if (profiles.length === 0) {
      return { routed: false, reason: "no_routing_profiles_configured" };
    }

    // Active lead counts: best-effort 0 for all (the deterministic path
    // already passes 0 today; real capacity tracking is a separate task).
    const agentProfiles = profiles.map((profile) =>
      mapRowToAgentRoutingProfile({
        profile,
        displayName: profile.role_label,
        activeLeadCount: 0,
      }),
    );

    const decision = decideLeadRouting({
      qualification: {
        leadId: lead.id,
        workspaceId: lead.workspace_id,
        leadType: lead.lead_type,
        targetArea: lead.target_area ?? null,
        propertyType: null,
        budgetMin: lead.budget_min ?? null,
        budgetMax: lead.budget_max ?? null,
        timeline: lead.timeline ?? null,
        financingStatus: lead.financing_status ?? "unknown",
        score: lead.score ?? 0,
        sourceOwnerMemberId: null,
      },
      agents: agentProfiles,
      escalationMemberId: null,
      roundRobinCursorMemberId: null,
    });

    if (decision.status !== "assigned" || decision.assignedMemberId === null) {
      return {
        routed: false,
        reason: decision.status === "hold_for_qualification" ? "hold_for_qualification" : "no_match",
        decision,
      };
    }

    // Persist the assignment.
    const leadUpdate: TablesUpdate<"leads"> = {
      assigned_agent_id: decision.assignedMemberId,
      status: "assigned",
      updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await deps.supabase
      .from("leads")
      .update(leadUpdate)
      .eq("workspace_id", deps.context.workspaceId)
      .eq("id", lead.id);

    if (updateError !== null) {
      throw updateError;
    }

    return {
      routed: true,
      assignedMemberId: decision.assignedMemberId,
      assignedDisplayName: decision.assignedDisplayName,
      reason: decision.reasons.join("; ") || toolCall.reason,
    };
  };

  handlers["sync_follow_up_boss"] = async (toolCall) => {
    const occurredAt = new Date().toISOString();
    const idempotencyKey = `harwick_ai_fub_sync:${deps.context.leadId}:${Date.now()}`;
    const insert: TablesInsert<"workflow_jobs"> = {
      workspace_id: deps.context.workspaceId,
      lead_id: deps.context.leadId,
      lead_event_id: deps.context.leadEventId,
      job_type: "fub_sync",
      status: "queued",
      run_after: occurredAt,
      idempotency_key: idempotencyKey,
      attempt_count: 0,
      max_attempts: 5,
      payload: {
        jobType: "fub_sync",
        workspaceId: deps.context.workspaceId,
        leadId: deps.context.leadId,
        source: "harwick_ai_tool",
        reason: toolCall.reason,
      },
    };

    const { error } = await deps.supabase
      .from("workflow_jobs")
      .insert(insert);

    if (error !== null) {
      throw error;
    }

    return { enqueued: true, jobType: "fub_sync", idempotencyKey };
  };

  handlers["pause_automation"] = async (toolCall) => {
    const reason = readPayloadString(toolCall, "reason") ?? toolCall.reason;
    const occurredAt = new Date().toISOString();

    const existing = await deps.conversationAutomationRepository.findAutomationState({
      workspaceId: deps.context.workspaceId,
      leadId: deps.context.leadId,
    });

    if (existing === null) {
      await deps.conversationAutomationRepository.insertAutomationState({
        workspaceId: deps.context.workspaceId,
        leadId: deps.context.leadId,
        automationMode: "human_takeover",
        automationReason: reason,
        changedByMemberId: deps.context.lead?.assigned_agent_id ?? deps.context.workspaceId,
        changedAt: occurredAt,
      });
    } else {
      await deps.conversationAutomationRepository.updateAutomationState({
        stateId: existing.id,
        automationMode: "human_takeover",
        automationReason: reason,
        changedByMemberId: deps.context.lead?.assigned_agent_id
          ?? existing.changed_by_member_id
          ?? deps.context.workspaceId,
        changedAt: occurredAt,
      });
    }

    return { paused: true, reason };
  };

  handlers["dispatch_subagent"] = async (toolCall) => {
    const subagentType = readSubagentType(toolCall);
    const title = readPayloadString(toolCall, "title") ?? `${subagentType} subagent task`;
    const instructions = readPayloadString(toolCall, "instructions") ?? toolCall.reason;
    const occurredAt = new Date().toISOString();
    const insert: TablesInsert<"harwick_subagent_tasks"> = {
      workspace_id: deps.context.workspaceId,
      lead_id: deps.context.leadId,
      trajectory_id: deps.context.agentTrajectoryId,
      step_id: deps.context.agentStepId,
      subagent_type: subagentType,
      status: "queued",
      priority: readPayloadPriority(toolCall),
      title,
      instructions,
      payload: {
        source: "harwick_ai_tool",
        reason: toolCall.reason,
        payload: toolCall.payload,
      } as Json,
      created_at: occurredAt,
      updated_at: occurredAt,
    };

    const { data, error } = await deps.supabase
      .from("harwick_subagent_tasks")
      .insert(insert)
      .select("id")
      .single<{ id: string }>();

    if (error !== null) {
      throw error;
    }

    return {
      queued: true,
      taskId: data.id,
      subagentType,
      title,
    };
  };

  return handlers;
}

/**
 * Tools whose descriptions advertise that they require operator approval
 * before execution. The model self-gates against this list, and the
 * runtime double-checks via the policy narrative.
 */
export const APPROVAL_REQUIRED_TOOLS: ReadonlySet<HarwickAiToolName> = new Set([
  "request_showing_approval",
  "register_open_house",
  "route_lead",
  "sync_follow_up_boss",
]);
