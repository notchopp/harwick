import {
  ConversationsInboxResponseSchema,
  classifyHarwickLeadActionability,
  type ConversationInboxMessage,
  type ConversationInboxSource,
  type ConversationInboxStageTone,
  type ConversationInboxThread,
  type ConversationAiSynthesis,
  type ConversationsInboxResponse,
} from "@realty-ops/core";
import type {
  LeadEventRow,
  SocialReplyReviewRow,
  WorkspaceMemberRow,
} from "../../lib/supabase/database.types";
import type { ConversationMessageRow } from "../../lib/supabase/conversation-messages";
import type { LeadRow } from "../../lib/supabase/leads";

export type ConversationsInboxRepository = {
  listLeads(params: { workspaceId: string; limit: number }): Promise<LeadRow[]>;
  listWorkspaceMembers(workspaceId: string): Promise<Array<Pick<WorkspaceMemberRow, "id" | "display_name">>>;
  listLeadEvents(params: { workspaceId: string; leadIds: string[]; limit: number }): Promise<LeadEventRow[]>;
  listConversationMessages(params: { workspaceId: string; leadIds: string[]; limit: number }): Promise<ConversationMessageRow[]>;
  listSocialReplyReviews(params: { workspaceId: string; leadIds: string[] }): Promise<SocialReplyReviewRow[]>;
  listConversationAutomationStates(params: { workspaceId: string; leadIds: string[] }): Promise<Array<{ leadId: string | null; automationMode: string }>>;
  listLatestAiSynthesis(params: { workspaceId: string; leadIds: string[] }): Promise<Array<ConversationAiSynthesis & { leadId: string }>>;
  listInFlightAiSynthesis(params: { workspaceId: string; leadIds: string[] }): Promise<Array<ConversationAiSynthesis & { leadId: string }>>;
};

function initialsForName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "LD";
}

function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sourceFromChannel(channel: LeadRow["source_channel"]): ConversationInboxSource {
  if (channel === "call") return "voice";
  if (channel === "sms") return "sms";
  if (channel.startsWith("facebook")) return "facebook";
  if (channel === "manual" || channel === "csv_import") return "manual";
  return "instagram";
}

function sourceLabel(source: ConversationInboxSource): string {
  if (source === "voice") return "Voice";
  if (source === "sms") return "SMS";
  if (source === "manual") return "Manual";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function channelLabel(channel: LeadRow["source_channel"]): string {
  if (channel === "instagram_comment" || channel === "facebook_comment") return "Comment";
  if (channel === "instagram_dm" || channel === "facebook_dm") return "DM";
  if (channel === "call") return "Call";
  if (channel === "sms") return "SMS";
  if (channel === "csv_import") return "Import";
  return "Manual";
}

function bucketForChannel(channel: LeadRow["source_channel"]): ConversationInboxThread["bucket"] {
  return channel === "instagram_comment" || channel === "facebook_comment" ? "comments" : "dms";
}

function sourceContext(lead: LeadRow): string {
  if (lead.source_channel === "instagram_dm") {
    return lead.instagram_username === null ? "Instagram direct message" : `DM with @${lead.instagram_username}`;
  }
  if (lead.source_channel === "instagram_comment") return "Instagram comment thread";
  if (lead.source_channel === "facebook_dm") return "Facebook direct message";
  if (lead.source_channel === "facebook_comment") return "Facebook comment thread";
  if (lead.source_channel === "call") return "Inbound voice call summary";
  if (lead.source_channel === "sms") return "SMS conversation";
  if (lead.source_channel === "csv_import") return "Imported conversation";
  return "Manual conversation";
}

function stageTone(lead: LeadRow): ConversationInboxStageTone {
  if (lead.status === "nurture") return "nurture";
  if (lead.status === "closed_lost" || lead.status === "archived") return "lost";
  if (lead.status === "qualified" || lead.status === "hot" || lead.status === "assigned" || lead.status === "appointment_booked" || lead.status === "active_client") {
    return "qualified";
  }
  if (lead.assigned_agent_id === null && lead.score >= 70) return "review";
  return "new";
}

function stageLabel(lead: LeadRow): string {
  const tone = stageTone(lead);
  if (tone === "qualified") return "Qualified";
  if (tone === "nurture") return "Nurture";
  if (tone === "lost") return "Lost";
  if (tone === "review") return "Owner review";
  return "New";
}

function formatBudget(lead: LeadRow): string {
  if (lead.budget_min === null && lead.budget_max === null) return "Unknown";
  if (lead.budget_min !== null && lead.budget_max !== null) return `$${Math.round(lead.budget_min / 1000)}k-$${Math.round(lead.budget_max / 1000)}k`;
  if (lead.budget_min !== null) return `$${Math.round(lead.budget_min / 1000)}k+`;
  return `Up to $${Math.round((lead.budget_max ?? 0) / 1000)}k`;
}

function formatShortRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "now";
  if (diffMs < 60 * 60_000) return `${Math.max(1, Math.round(diffMs / 60_000))}m`;
  if (diffMs < 24 * 60 * 60_000) return `${Math.max(1, Math.round(diffMs / (60 * 60_000)))}h`;
  return `${Math.max(1, Math.round(diffMs / (24 * 60 * 60_000)))}d`;
}

function formatMessageMeta(iso: string, source: string, channel: string): string {
  return `${new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })} · ${source} ${channel}`;
}

function eventSummary(row: LeadEventRow): string {
  if (row.text !== null && row.text.trim().length > 0) {
    return row.text.trim();
  }
  if (row.event_type === "call_completed") return "Voice call summary captured";
  if (row.event_type === "reply_sent") return "Reply sent";
  return titleCase(row.event_type);
}

function isTranscriptEvent(row: LeadEventRow): boolean {
  return (
    row.event_type === "message_received"
    || row.event_type === "comment_received"
    || row.event_type === "reply_sent"
  );
}

function directionForEvent(row: LeadEventRow): "inbound" | "outbound" {
  return row.event_type === "reply_sent" ? "outbound" : "inbound";
}

function directionForConversationMessage(row: ConversationMessageRow): "inbound" | "outbound" {
  return row.sender_type === "customer" ? "inbound" : "outbound";
}

function isDuplicateTranscriptEvent(row: LeadEventRow, conversationMessages: ConversationMessageRow[]): boolean {
  if (row.text === null || row.text.trim().length === 0 || !isTranscriptEvent(row)) {
    return false;
  }

  const eventText = row.text.trim();
  const eventDirection = directionForEvent(row);
  const eventTime = new Date(row.occurred_at).getTime();

  return conversationMessages.some((message) => {
    if (message.provider_message_id !== null && row.provider_event_id === message.provider_message_id) {
      return true;
    }
    if (message.body.trim() !== eventText) {
      return false;
    }
    if (directionForConversationMessage(message) !== eventDirection) {
      return false;
    }
    return Math.abs(new Date(message.created_at).getTime() - eventTime) <= 5 * 60_000;
  });
}

function conversationMessageMeta(row: ConversationMessageRow, source: string, channel: string): string {
  const timestamp = new Date(row.created_at).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const statusSuffix = row.status === "failed"
    ? " · failed"
    : row.status === "in_progress"
      ? " · sending"
      : "";

  if (row.sender_type === "customer") {
    return `${timestamp} · ${source} ${channel}${statusSuffix}`;
  }
  if (row.sender_type === "ai") {
    return `${timestamp} · Harwick AI via ${source} ${channel}${statusSuffix}`;
  }
  return `${timestamp} · Operator via ${source} ${channel}${statusSuffix}`;
}

function mapConversationMessage(params: {
  row: ConversationMessageRow;
  source: string;
  channel: string;
}): ConversationInboxMessage {
  return {
    id: params.row.id,
    kind: params.row.sender_type === "customer" ? "lead" : "sent",
    body: params.row.body.trim(),
    meta: conversationMessageMeta(params.row, params.source, params.channel),
    occurredAt: params.row.created_at,
    agentTrajectoryId: params.row.agent_trajectory_id,
    agentStepId: params.row.agent_step_id,
  };
}

function mapLeadEventMessage(params: {
  row: LeadEventRow;
  source: string;
  channel: string;
}): ConversationInboxMessage {
  if (params.row.event_type === "reply_sent" && params.row.text !== null && params.row.text.trim().length > 0) {
    return {
      id: params.row.id,
      kind: "sent",
      body: params.row.text.trim(),
      meta: `${new Date(params.row.occurred_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })} · Sent via ${params.source} ${params.channel}`,
      occurredAt: params.row.occurred_at,
      agentTrajectoryId: null,
      agentStepId: null,
    };
  }

  if (params.row.text !== null && params.row.text.trim().length > 0) {
    return {
      id: params.row.id,
      kind: "lead",
      body: params.row.text.trim(),
      meta: formatMessageMeta(params.row.occurred_at, params.source, params.channel),
      occurredAt: params.row.occurred_at,
      agentTrajectoryId: null,
      agentStepId: null,
    };
  }

  return {
    id: params.row.id,
    kind: "system",
    body: eventSummary(params.row),
    meta: formatMessageMeta(params.row.occurred_at, params.source, params.channel),
    occurredAt: params.row.occurred_at,
    agentTrajectoryId: null,
    agentStepId: null,
  };
}

function listingTitle(lead: LeadRow): string {
  if (lead.target_area !== null && lead.lead_type !== "unknown") {
    return `${titleCase(lead.lead_type)} search · ${lead.target_area}`;
  }
  if (lead.target_area !== null) {
    return `${lead.target_area} search context`;
  }
  if (lead.lead_type !== "unknown") {
    return `${titleCase(lead.lead_type)} conversation`;
  }
  return "Conversation context";
}

function listingDetails(lead: LeadRow, lastTouchLabel: string): string {
  return `${sourceLabel(sourceFromChannel(lead.source_channel))} ${channelLabel(lead.source_channel)} · last touch ${lastTouchLabel}`;
}

function listingStatus(lead: LeadRow, review: SocialReplyReviewRow | null): string {
  if (review !== null && review.suggested_reply !== null && (review.status === "pending" || review.status === "approved")) {
    return "AI action ready";
  }
  if (lead.follow_up_boss_contact_id !== null) return "FUB synced";
  if (lead.status === "nurture") return "Follow-up active";
  if (lead.assigned_agent_id === null) return "Owner review";
  if (lead.source_channel === "call") return "Call summary";
  return "Live conversation";
}

function reviewMeta(review: SocialReplyReviewRow): string {
  if (review.status === "approved") return "AI Action — Approved and ready to send";
  return "AI Action — Ready for approval";
}

function buildMessages(params: {
  lead: LeadRow;
  events: LeadEventRow[];
  conversationMessages: ConversationMessageRow[];
  review: SocialReplyReviewRow | null;
}): ConversationInboxMessage[] {
  const source = sourceLabel(sourceFromChannel(params.lead.source_channel));
  const channel = channelLabel(params.lead.source_channel);
  const messages = params.conversationMessages
    .filter((row) => row.body.trim().length > 0)
    .map((row) => mapConversationMessage({ row, source, channel }));

  for (const row of params.events) {
    if (isDuplicateTranscriptEvent(row, params.conversationMessages)) {
      continue;
    }
    messages.push(mapLeadEventMessage({ row, source, channel }));
  }

  const review = params.review;
  if (review !== null && review.suggested_reply !== null && (review.status === "pending" || review.status === "approved")) {
    messages.push({
      id: review.id,
      kind: "ai_action",
      body: review.suggested_reply,
      meta: reviewMeta(review),
      occurredAt: review.updated_at,
      agentTrajectoryId: null,
      agentStepId: null,
    });
  }

  if (messages.length === 0) {
    messages.push({
      id: `lead:${params.lead.id}:empty`,
      kind: "system",
      body: "No conversation text has been captured for this lead yet.",
      meta: formatMessageMeta(params.lead.created_at, source, channel),
      occurredAt: params.lead.created_at,
      agentTrajectoryId: null,
      agentStepId: null,
    });
  }

  return messages.sort((left, right) => {
    return new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();
  });
}

function previewFor(params: {
  events: LeadEventRow[];
  conversationMessages: ConversationMessageRow[];
  review: SocialReplyReviewRow | null;
}): string {
  const review = params.review;
  if (review !== null && review.suggested_reply !== null && (review.status === "pending" || review.status === "approved")) {
    return `AI action ready: ${review.suggested_reply}`;
  }
  const latestConversationMessage = params.conversationMessages[params.conversationMessages.length - 1];
  if (latestConversationMessage !== undefined) {
    return latestConversationMessage.body;
  }
  const latestEvent = params.events[params.events.length - 1];
  if (latestEvent !== undefined) {
    return eventSummary(latestEvent);
  }
  return "No conversation captured yet.";
}

function sliceLatestEvents(events: LeadEventRow[], limit: number): LeadEventRow[] {
  if (events.length <= limit) return events;
  return events.slice(-limit);
}

export async function loadConversationsInbox(params: {
  workspaceId: string;
  repository: ConversationsInboxRepository;
  limit?: number;
}): Promise<ConversationsInboxResponse> {
  const limit = Math.min(params.limit ?? 30, 100);
  const leads = await params.repository.listLeads({
    workspaceId: params.workspaceId,
    limit,
  });
  const leadIds = leads.map((lead) => lead.id);

  const [members, events, conversationMessages, reviews, automationStates, aiSynthesisRows, inFlightAiSynthesisRows] = await Promise.all([
    params.repository.listWorkspaceMembers(params.workspaceId),
    params.repository.listLeadEvents({
      workspaceId: params.workspaceId,
      leadIds,
      limit: Math.max(limit * 12, 120),
    }),
    params.repository.listConversationMessages({
      workspaceId: params.workspaceId,
      leadIds,
      limit: Math.max(limit * 24, 240),
    }),
    params.repository.listSocialReplyReviews({
      workspaceId: params.workspaceId,
      leadIds,
    }),
    params.repository.listConversationAutomationStates({
      workspaceId: params.workspaceId,
      leadIds,
    }),
    params.repository.listLatestAiSynthesis({
      workspaceId: params.workspaceId,
      leadIds,
    }),
    params.repository.listInFlightAiSynthesis({
      workspaceId: params.workspaceId,
      leadIds,
    }),
  ]);

  const membersById = new Map(members.map((member) => [member.id, member.display_name]));
  const eventsByLeadId = new Map<string, LeadEventRow[]>();
  const conversationMessagesByLeadId = new Map<string, ConversationMessageRow[]>();
  const latestReviewByLeadId = new Map<string, SocialReplyReviewRow>();
  const automationModeByLeadId = new Map<string, string>();
  const aiSynthesisByLeadId = new Map<string, ConversationAiSynthesis>();

  for (const event of events) {
    if (event.lead_id === null) continue;
    const bucket = eventsByLeadId.get(event.lead_id) ?? [];
    bucket.push(event);
    eventsByLeadId.set(event.lead_id, bucket);
  }

  for (const review of reviews) {
    if (review.lead_id === null || latestReviewByLeadId.has(review.lead_id)) continue;
    latestReviewByLeadId.set(review.lead_id, review);
  }

  for (const state of automationStates) {
    if (state.leadId !== null) {
      automationModeByLeadId.set(state.leadId, state.automationMode);
    }
  }

  for (const message of conversationMessages) {
    const bucket = conversationMessagesByLeadId.get(message.lead_id) ?? [];
    bucket.push(message);
    conversationMessagesByLeadId.set(message.lead_id, bucket);
  }

  for (const synthesis of [...aiSynthesisRows, ...inFlightAiSynthesisRows]) {
    const existing = aiSynthesisByLeadId.get(synthesis.leadId);
    if (existing === undefined || Date.parse(synthesis.updatedAt) > Date.parse(existing.updatedAt)) {
      aiSynthesisByLeadId.set(synthesis.leadId, synthesis);
    }
  }

  const actionableLeads = leads.filter((lead) => {
    return classifyHarwickLeadActionability({
      sourceChannel: lead.source_channel,
      status: lead.status,
      intent: lead.intent,
      score: lead.score,
      assignedAgentId: lead.assigned_agent_id,
      nextFollowUpAt: lead.next_followup_at,
      followUpBossContactId: lead.follow_up_boss_contact_id,
    }).shouldShow;
  });

  const threads = actionableLeads.map((lead): ConversationInboxThread => {
    const name = lead.full_name ?? lead.instagram_username ?? lead.phone ?? "Unknown lead";
    const leadEvents = sliceLatestEvents(eventsByLeadId.get(lead.id) ?? [], 12);
    const threadConversationMessages = conversationMessagesByLeadId.get(lead.id) ?? [];
    const review = latestReviewByLeadId.get(lead.id) ?? null;
    const lastThreadMessageAt = threadConversationMessages[threadConversationMessages.length - 1]?.created_at;
    const lastTouchIso = lead.last_message_at ?? lastThreadMessageAt ?? leadEvents[leadEvents.length - 1]?.occurred_at ?? lead.created_at;
    const lastTouchLabel = formatShortRelative(lastTouchIso);

    // Use automation_mode from conversation_automation_states if available, fallback to review
    const rawMode = automationModeByLeadId.get(lead.id) ?? review?.automation_mode ?? null;
    const automationMode = (
      rawMode === "ai_on" || rawMode === "human_takeover" || rawMode === "paused_by_rule"
        ? rawMode
        : null
    );

    return {
      id: lead.id,
      workspaceId: params.workspaceId,
      leadId: lead.id,
      reviewId: review?.id ?? null,
      name,
      initials: initialsForName(name),
      lastTouchLabel,
      unread: false,
      preview: previewFor({
        events: leadEvents,
        conversationMessages: threadConversationMessages,
        review,
      }),
      source: sourceFromChannel(lead.source_channel),
      sourceLabel: sourceLabel(sourceFromChannel(lead.source_channel)),
      channelLabel: channelLabel(lead.source_channel),
      sourceContext: sourceContext(lead),
      bucket: bucketForChannel(lead.source_channel),
      assignedTo: lead.assigned_agent_id === null ? "Owner review" : (membersById.get(lead.assigned_agent_id) ?? "Assigned agent"),
      stageLabel: stageLabel(lead),
      stageTone: stageTone(lead),
      score: lead.score,
      scoreLabel: `${lead.score} / 100`,
      followUpBossContactId: lead.follow_up_boss_contact_id,
      intentType: lead.lead_type === "unknown" ? "Unknown" : titleCase(lead.lead_type),
      area: lead.target_area ?? "Unknown",
      timeline: lead.timeline ?? "Unknown",
      budget: formatBudget(lead),
      listingTitle: listingTitle(lead),
      listingDetails: listingDetails(lead, lastTouchLabel),
      listingStatus: listingStatus(lead, review),
      automationMode,
      automationReason: review?.automation_reason ?? null,
      aiSynthesis: aiSynthesisByLeadId.get(lead.id) ?? null,
      messages: buildMessages({
        lead,
        events: leadEvents,
        conversationMessages: threadConversationMessages,
        review,
      }),
    };
  });

  return ConversationsInboxResponseSchema.parse({
    workspaceId: params.workspaceId,
    threads,
  });
}
