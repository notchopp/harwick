import type {
  CalendarAvailabilityWindow,
  ConversationAutomationMode,
  GoogleCalendarCredential,
  HarwickAiToolCall,
  HarwickAiToolName,
  NormalizedLeadEvent,
  ShowingMode,
} from "@realty-ops/core";
import { decideLeadRouting, GoogleCalendarCredentialSchema } from "@realty-ops/core";
import type { GoogleCalendarClient, HarwickAiToolHandlers } from "@realty-ops/integrations";
import { createMetaMessagingClient } from "@realty-ops/integrations";
import type { ConversationMessageRepository } from "../../lib/supabase/conversation-messages";
import type { ConversationAutomationRepository } from "../../lib/supabase/conversation-automation";
import type { LeadEventPersistenceRepository } from "../../lib/supabase/lead-events";
import type { MemberRoutingProfileRepository } from "../../lib/supabase/member-routing-profiles";
import type { MemberCalendarConnectionRepository } from "../../lib/supabase/member-calendar-connections";
import { mapRowToAgentRoutingProfile } from "../../lib/supabase/member-routing-profiles";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import type { LeadRow } from "../../lib/supabase/leads";
import type { Json, TablesInsert, TablesUpdate } from "../../lib/supabase/database.types";
import { decryptCredential, encryptCredential } from "../../lib/credentials";
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
  automationMode: ConversationAutomationMode;
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
  calendarConnectionRepository?: MemberCalendarConnectionRepository;
  calendarClient?: Pick<GoogleCalendarClient, "queryFreeBusy"> & Partial<Pick<GoogleCalendarClient, "refreshAccessToken">>;
  googleCalendarOAuth?: {
    clientId: string;
    clientSecret: string;
  };
  credentialSecret: string;
  now?: () => Date;
};

function readPayloadString(toolCall: HarwickAiToolCall, key: string): string | null {
  const value = toolCall.payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readPayloadIsoDateTime(toolCall: HarwickAiToolCall, keys: string[]): string | null {
  for (const key of keys) {
    const value = readPayloadString(toolCall, key);
    if (value !== null && !Number.isNaN(Date.parse(value))) {
      return new Date(value).toISOString();
    }
  }
  return null;
}

function readPayloadPriority(toolCall: HarwickAiToolCall): "low" | "normal" | "high" | "urgent" {
  const value = readPayloadString(toolCall, "priority");
  return value === "low" || value === "high" || value === "urgent" ? value : "normal";
}

type MetaMessageTarget = "current_thread" | "comment" | "dm";

function readMetaMessageTarget(toolCall: HarwickAiToolCall): MetaMessageTarget {
  const value = readPayloadString(toolCall, "target");
  return value === "comment" || value === "dm" ? value : "current_thread";
}

function metaDmChannelFor(channel: HarwickAiToolContext["channel"]): "instagram_dm" | "facebook_dm" {
  return channel.startsWith("instagram") ? "instagram_dm" : "facebook_dm";
}

function readShowingMode(value: string | null): ShowingMode | null {
  return value === "collect_only" || value === "request_approve" || value === "auto_book"
    ? value
    : null;
}

function readSubagentType(toolCall: HarwickAiToolCall): "research" | "writer" | "calendar" | "routing" {
  const value = readPayloadString(toolCall, "subagentType") ?? readPayloadString(toolCall, "type");
  if (value === "writer" || value === "calendar" || value === "routing") return value;
  return "research";
}

function formatCalendarWindowLabel(start: Date, timezone: string): string {
  const dateLabel = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });
  const timeLabel = start.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
  return `${dateLabel} at ${timeLabel}`;
}

function buildCandidateShowingWindows(
  now: Date = new Date(),
  timezone = "America/New_York",
): CalendarAvailabilityWindow[] {
  const windows: CalendarAvailabilityWindow[] = [];
  const slots = [10, 14, 16];
  let added = 0;
  for (let dayOffset = 1; added < 9 && dayOffset < 14; dayOffset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + dayOffset);
    const dow = candidate.getDay();
    if (dow === 0 || dow === 6) continue;
    for (const hour of slots) {
      const start = new Date(candidate);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start);
      end.setMinutes(start.getMinutes() + 30);
      windows.push({
        start: start.toISOString(),
        end: end.toISOString(),
        label: formatCalendarWindowLabel(start, timezone),
      });
      added += 1;
    }
  }
  return windows;
}

function synthesizeAvailableWindows(now: Date = new Date()): string[] {
  return buildCandidateShowingWindows(now).map((window) => window.label);
}

async function findContextSourceOwnerMemberId(
  deps: HarwickAiToolHandlerDependencies,
): Promise<string | null> {
  const providerAccountId = deps.context.event.providerAccountId ?? deps.context.providerAccountId;
  if (providerAccountId === null || providerAccountId.trim().length === 0) {
    return null;
  }

  const { data, error } = await deps.supabase
    .from("integration_accounts")
    .select("owner_member_id")
    .eq("workspace_id", deps.context.workspaceId)
    .eq("provider", deps.context.event.provider)
    .eq("provider_account_id", providerAccountId)
    .eq("status", "connected")
    .maybeSingle<{ owner_member_id: string | null }>();

  if (error !== null) {
    throw error;
  }
  if (data?.owner_member_id !== undefined) {
    return data.owner_member_id;
  }

  const { data: aliasData, error: aliasError } = await deps.supabase
    .from("integration_accounts")
    .select("owner_member_id")
    .eq("workspace_id", deps.context.workspaceId)
    .eq("provider", deps.context.event.provider)
    .contains("provider_account_ids", [providerAccountId])
    .eq("status", "connected")
    .maybeSingle<{ owner_member_id: string | null }>();

  if (aliasError !== null) {
    throw aliasError;
  }

  return aliasData?.owner_member_id ?? null;
}

function windowsOverlap(
  candidate: Pick<CalendarAvailabilityWindow, "start" | "end">,
  busy: { start: string; end: string },
): boolean {
  const candidateStart = new Date(candidate.start).getTime();
  const candidateEnd = new Date(candidate.end).getTime();
  const busyStart = new Date(busy.start).getTime();
  const busyEnd = new Date(busy.end).getTime();

  if ([candidateStart, candidateEnd, busyStart, busyEnd].some((value) => Number.isNaN(value))) {
    return false;
  }

  return candidateStart < busyEnd && candidateEnd > busyStart;
}

function shouldRefreshGoogleCredential(credential: GoogleCalendarCredential, now: Date): boolean {
  if (credential.refreshToken === null || credential.expiresAt === null) {
    return false;
  }

  const expiresAt = new Date(credential.expiresAt).getTime();
  if (Number.isNaN(expiresAt)) {
    return false;
  }

  return expiresAt <= now.getTime() + 2 * 60 * 1000;
}

function buildGoogleCredentialFromRefresh(params: {
  existing: GoogleCalendarCredential;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
  scope?: string;
  now: Date;
}): GoogleCalendarCredential {
  return GoogleCalendarCredentialSchema.parse({
    version: "google_calendar_oauth_v1",
    accessToken: params.accessToken,
    refreshToken: params.refreshToken ?? params.existing.refreshToken,
    tokenType: params.tokenType,
    scope: params.scope ?? params.existing.scope,
    expiresAt: params.expiresIn === undefined
      ? null
      : new Date(params.now.getTime() + params.expiresIn * 1000).toISOString(),
  });
}

export function createHarwickAiToolHandlers(
  deps: HarwickAiToolHandlerDependencies,
): HarwickAiToolHandlers {
  const handlers: HarwickAiToolHandlers = {};

  const sendMetaTool = async (
    toolCall: HarwickAiToolCall,
    forcedTarget?: MetaMessageTarget,
  ): Promise<Record<string, unknown>> => {
    const reply = readPayloadString(toolCall, "reply");
    if (reply === null) {
      return { sent: false, reason: "missing_reply_payload" };
    }

    const target = forcedTarget ?? readMetaMessageTarget(toolCall);
    const sendChannel = target === "comment"
      ? deps.context.channel
      : target === "dm"
        ? metaDmChannelFor(deps.context.channel)
        : deps.context.channel.endsWith("_comment")
          ? deps.context.channel
          : metaDmChannelFor(deps.context.channel);

    if (sendChannel.endsWith("_comment") && deps.context.sourceCommentId === null) {
      return { sent: false, reason: "missing_source_comment" };
    }

    if (sendChannel.endsWith("_dm") && deps.context.recipientUserId === null) {
      return { sent: false, reason: "missing_recipient_user" };
    }

    const handoffFromComment = deps.context.channel.endsWith("_comment") && target === "dm";

    const result = await sendMetaReply({
      request: {
        workspaceId: deps.context.workspaceId,
        leadId: deps.context.leadId,
        providerAccountId: deps.context.providerAccountId,
        channel: sendChannel,
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
        handoffFromComment,
        sourceCommentId: handoffFromComment ? deps.context.sourceCommentId : null,
      };
    }
    return { sent: false, reason: result.body.error };
  };

  handlers["send_meta_message"] = (toolCall) => sendMetaTool(toolCall);
  handlers["send_meta_reply"] = (toolCall) => sendMetaTool(toolCall, "comment");
  handlers["send_meta_dm"] = (toolCall) => sendMetaTool(toolCall, "dm");

  handlers["check_calendar"] = async (toolCall) => {
    const requestedListing = readPayloadString(toolCall, "listing");
    const assignedAgentId = deps.context.lead?.assigned_agent_id ?? null;
    let agentName: string | null = null;
    const now = deps.now?.() ?? new Date();
    const availableWindows = synthesizeAvailableWindows(now);

    if (assignedAgentId !== null) {
      const profile = await deps.memberRoutingRepository.findProfileByMemberId({
        workspaceId: deps.context.workspaceId,
        memberId: assignedAgentId,
      });
      if (profile !== null) {
        agentName = profile.role_label;
      }
    }

    if (
      assignedAgentId !== null
      && deps.calendarConnectionRepository !== undefined
      && deps.calendarClient !== undefined
    ) {
      try {
        const connection = await deps.calendarConnectionRepository.findActiveConnection({
          workspaceId: deps.context.workspaceId,
          memberId: assignedAgentId,
        });

        if (connection !== null) {
          let credential = GoogleCalendarCredentialSchema.parse(
            decryptCredential<unknown>(connection.encryptedCredentialRef, deps.credentialSecret),
          );
          if (
            shouldRefreshGoogleCredential(credential, now)
            && credential.refreshToken !== null
            && deps.calendarClient.refreshAccessToken !== undefined
            && deps.googleCalendarOAuth !== undefined
          ) {
            const refreshed = await deps.calendarClient.refreshAccessToken({
              clientId: deps.googleCalendarOAuth.clientId,
              clientSecret: deps.googleCalendarOAuth.clientSecret,
              refreshToken: credential.refreshToken,
            });
            credential = buildGoogleCredentialFromRefresh({
              existing: credential,
              accessToken: refreshed.access_token,
              tokenType: refreshed.token_type,
              now,
              ...(refreshed.refresh_token === undefined ? {} : { refreshToken: refreshed.refresh_token }),
              ...(refreshed.expires_in === undefined ? {} : { expiresIn: refreshed.expires_in }),
              ...(refreshed.scope === undefined ? {} : { scope: refreshed.scope }),
            });
            await deps.calendarConnectionRepository.updateEncryptedCredential({
              connectionId: connection.id,
              encryptedCredentialRef: encryptCredential(credential, deps.credentialSecret),
              syncedAt: now.toISOString(),
            });
          }
          const candidates = buildCandidateShowingWindows(now, connection.timezone);
          const timeMax = new Date(now);
          timeMax.setDate(now.getDate() + 14);
          const freeBusy = await deps.calendarClient.queryFreeBusy({
            accessToken: credential.accessToken,
            calendarIds: [connection.calendarId],
            timeMin: now.toISOString(),
            timeMax: timeMax.toISOString(),
            timeZone: connection.timezone,
          });
          const busyWindows = freeBusy.calendars.find((calendar) =>
            calendar.calendarId === connection.calendarId
          )?.busy ?? [];
          const realAvailableWindows = candidates
            .filter((candidate) => !busyWindows.some((busy) => windowsOverlap(candidate, busy)))
            .slice(0, 6);

          return {
            assignedAgentId,
            agentName,
            requestedListing,
            source: "google_calendar",
            provider: connection.provider,
            calendarId: connection.calendarId,
            showingMode: connection.showingMode,
            timezone: connection.timezone,
            availableWindows: realAvailableWindows.map((window) => window.label),
            availableWindowDetails: realAvailableWindows,
            busyWindows,
            synthesized: false,
            note: connection.showingMode === "auto_book"
              ? "Calendar availability came from the agent's connected Google Calendar. Auto-booking is still gated by qualification and policy."
              : "Calendar availability came from the agent's connected Google Calendar. Default to request + approve before confirming a showing.",
          };
        }
      } catch (error) {
        console.warn("[check_calendar] Google Calendar lookup failed; falling back to synthesized windows", error);
      }
    }

    return {
      assignedAgentId,
      agentName,
      requestedListing,
      availableWindows: availableWindows.slice(0, 6),
      synthesized: true,
      note: "No connected agent calendar was available. These windows are synthesized; confirm with the agent before promising.",
    };
  };

  handlers["request_showing_approval"] = async (toolCall) => {
    const occurredAt = new Date().toISOString();
    const listing = readPayloadString(toolCall, "listing");
    const requestedTime = readPayloadString(toolCall, "requestedTime") ?? readPayloadString(toolCall, "time");
    const requestedStart = readPayloadIsoDateTime(toolCall, ["requestedStart", "start", "startTime"]);
    const requestedEnd = readPayloadIsoDateTime(toolCall, ["requestedEnd", "end", "endTime"]);
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
        requestedStart === null ? "" : `Requested start: ${requestedStart}.`,
        requestedEnd === null ? "" : `Requested end: ${requestedEnd}.`,
        `Reason: ${toolCall.reason}`,
      ].filter((line) => line.length > 0).join("\n"),
      requested_start_at: requestedStart,
      requested_end_at: requestedEnd,
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
      requestedStart,
      requestedEnd,
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

    const [profiles, membersResult, activeLeadsResult, calendarConnectionsResult, sourceOwnerMemberId] = await Promise.all([
      deps.memberRoutingRepository.listProfilesForWorkspace(deps.context.workspaceId),
      deps.supabase
        .from("workspace_members")
        .select("id, display_name, role")
        .eq("workspace_id", deps.context.workspaceId)
        .eq("is_active", true)
        .returns<Array<{ id: string; display_name: string; role: string }>>(),
      deps.supabase
        .from("leads")
        .select("assigned_agent_id, status")
        .eq("workspace_id", deps.context.workspaceId)
        .not("assigned_agent_id", "is", null)
        .not("status", "in", "(closed_won,closed_lost,archived)")
        .returns<Array<Pick<LeadRow, "assigned_agent_id" | "status">>>(),
      deps.supabase
        .from("workspace_member_calendar_connections")
        .select("member_id, showing_mode")
        .eq("workspace_id", deps.context.workspaceId)
        .eq("provider", "google")
        .eq("status", "connected")
        .returns<Array<{ member_id: string; showing_mode: string | null }>>(),
      findContextSourceOwnerMemberId(deps),
    ]);

    if (membersResult.error !== null) {
      throw membersResult.error;
    }
    if (activeLeadsResult.error !== null) {
      throw activeLeadsResult.error;
    }
    if (calendarConnectionsResult.error !== null) {
      throw calendarConnectionsResult.error;
    }

    const activeLeadCounts: Record<string, number> = {};
    for (const row of activeLeadsResult.data ?? []) {
      if (row.assigned_agent_id !== null) {
        activeLeadCounts[row.assigned_agent_id] = (activeLeadCounts[row.assigned_agent_id] ?? 0) + 1;
      }
    }

    const members = membersResult.data ?? [];
    const calendarSignals = new Map(
      (calendarConnectionsResult.data ?? []).map((connection) => [
        connection.member_id,
        readShowingMode(connection.showing_mode),
      ]),
    );
    const membersById = new Map(members.map((member) => [member.id, member]));
    const escalationMemberId = members.find((member) =>
      member.role === "owner"
      || member.role === "admin"
      || member.role === "team_lead"
      || member.role === "lead_manager"
    )?.id ?? null;
    const agentProfiles = profiles.flatMap((profile) => {
      const member = membersById.get(profile.member_id);
      if (member === undefined) {
        return [];
      }

      return [mapRowToAgentRoutingProfile({
        profile,
        displayName: member.display_name,
        activeLeadCount: activeLeadCounts[profile.member_id] ?? 0,
        calendarStatus: calendarSignals.has(profile.member_id) ? "connected" : "missing",
        showingMode: calendarSignals.get(profile.member_id) ?? null,
      })];
    });

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
        sourceOwnerMemberId,
      },
      agents: agentProfiles,
      escalationMemberId,
      roundRobinCursorMemberId: null,
    });

    const occurredAt = new Date().toISOString();
    const routingDecisionInsert: TablesInsert<"harwick_routing_decisions"> = {
      workspace_id: deps.context.workspaceId,
      lead_id: lead.id,
      trajectory_id: deps.context.agentTrajectoryId,
      step_id: deps.context.agentStepId,
      suggested_member_id: decision.assignedMemberId,
      final_member_id: decision.status === "assigned" ? decision.assignedMemberId : null,
      status: decision.status === "assigned" ? "assigned" : "suggested",
      confidence: Math.max(0, Math.min(1, decision.matchScore / 100)),
      reason: decision.reasons.join("; ") || decision.taskLabel,
      evidence: {
        mode: "harwick_tool",
        toolReason: toolCall.reason,
        decisionStatus: decision.status,
        matchScore: decision.matchScore,
        sourceOwnerMemberId: decision.sourceOwnerMemberId,
        calendarSignals: Object.fromEntries(calendarSignals.entries()),
        reasons: decision.reasons,
      },
      created_by_actor_type: "ai",
      decided_by_member_id: null,
      decided_at: decision.status === "assigned" ? occurredAt : null,
      override_reason: null,
      updated_at: occurredAt,
    };
    const { data: routingDecision, error: routingDecisionError } = await deps.supabase
      .from("harwick_routing_decisions")
      .insert(routingDecisionInsert)
      .select("id")
      .single<{ id: string }>();

    if (routingDecisionError !== null) {
      throw routingDecisionError;
    }

    if (decision.status !== "assigned" || decision.assignedMemberId === null) {
      return {
        routed: false,
        reason: decision.status === "hold_for_qualification"
          ? "hold_for_qualification"
          : profiles.length === 0
            ? "no_routing_profiles_configured"
            : "no_match",
        routingDecisionId: routingDecision.id,
        decision,
      };
    }

    // Persist the assignment.
    const leadUpdate: TablesUpdate<"leads"> = {
      assigned_agent_id: decision.assignedMemberId,
      status: "assigned",
      updated_at: occurredAt,
    };
    const { error: updateError } = await deps.supabase
      .from("leads")
      .update(leadUpdate)
      .eq("workspace_id", deps.context.workspaceId)
      .eq("id", lead.id);

    if (updateError !== null) {
      throw updateError;
    }

    const auditInsert: TablesInsert<"audit_logs"> = {
      workspace_id: deps.context.workspaceId,
      user_id: null,
      actor_type: "ai",
      action: lead.assigned_agent_id === null ? "lead.assigned" : "lead.reassigned",
      resource_type: "lead",
      resource_id: lead.id,
      metadata: {
        mode: "harwick_tool",
        routingDecisionId: routingDecision.id,
        previousAssignedMemberId: lead.assigned_agent_id,
        assignedMemberId: decision.assignedMemberId,
        reasons: decision.reasons,
        source: "route_lead",
      },
    };
    const { error: auditError } = await deps.supabase
      .from("audit_logs")
      .insert([auditInsert]);

    if (auditError !== null) {
      throw auditError;
    }

    return {
      routed: true,
      routingDecisionId: routingDecision.id,
      assignedMemberId: decision.assignedMemberId,
      assignedDisplayName: decision.assignedDisplayName,
      reason: decision.reasons.join("; ") || toolCall.reason,
    };
  };

  handlers["sync_follow_up_boss"] = async () => {
    const occurredAt = new Date().toISOString();
    const idempotencyKey = `fub_sync:${deps.context.leadId}`;
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
        qualifiedOnly: true,
      },
    };

    const { error } = await deps.supabase
      .from("workflow_jobs")
      .upsert(insert, {
        onConflict: "workspace_id,idempotency_key",
      });

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
