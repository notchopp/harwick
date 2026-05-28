import { classifyHarwickLeadActionability, workspaceRoleHasCapability, type WorkspaceRole } from "@realty-ops/core";
import type { ConversationAutomationMode } from "@realty-ops/core";
import type { WorkspaceMemberRow } from "../../lib/supabase/database.types";
import type { LeadRow } from "../../lib/supabase/leads";
import type { ListingFactRow } from "../../lib/supabase/listings";

export type LeadPageSource = "instagram" | "facebook" | "voice" | "listing_chat" | "manual";
export type LeadPageStage = "hot" | "qualified" | "unrouted" | "callback" | "nurture" | "showing";
export type LeadPageCardKind = "listing" | "area" | "seller";

export type LeadPageItem = {
  id: string;
  workspaceId: string;
  name: string;
  initials: string;
  phone: string | null;
  source: LeadPageSource;
  sourceDetail: string;
  stage: LeadPageStage;
  stageLabel: string;
  cardKind: LeadPageCardKind;
  intent: string;
  leadType: LeadRow["lead_type"];
  intentLevel: LeadRow["intent"];
  score: number;
  budget: string;
  area: string;
  timeline: string;
  propertyType: string;
  financingStatus: LeadRow["financing_status"];
  assignedTo: string;
  assignedMemberId: string | null;
  sourceOwner: string;
  lastTouch: string;
  routeReason: string;
  listing: string;
  message: string;
  reviewId: string | null;
  automationMode: ConversationAutomationMode | null;
  automationReason: string | null;
  // Harwick's running notes on this lead — surfaced in the drawer so
  // the operator sees a digest of what got captured across the chat
  // without scrolling through every turn. Built up by the model via
  // `documentUpdate` on each surface-tool call.
  qualificationSummary: string | null;
  leadDocument: string | null;
};

export type LeadsPageData = {
  workspaceId: string;
  items: LeadPageItem[];
};

export type LeadsPageViewer = {
  memberId: string;
  role: WorkspaceMemberRow["role"];
};

export type LeadsPageRepository = {
  listLeads(workspaceId: string, limit: number, viewer: LeadsPageViewer): Promise<LeadRow[]>;
  listWorkspaceMembers(workspaceId: string): Promise<Array<Pick<WorkspaceMemberRow, "id" | "display_name" | "role">>>;
  listListingFacts(workspaceId: string, limit: number): Promise<Array<Pick<ListingFactRow, "address" | "status" | "price">>>;
  findLatestLeadMessage(params: { workspaceId: string; leadId: string }): Promise<string | null>;
  findLatestSocialReviewForLead(params: { workspaceId: string; leadId: string }): Promise<{
    id: string;
    automationMode: ConversationAutomationMode;
    automationReason: string | null;
  } | null>;
};

/**
 * Display-name ordering, intent-aware. For public-chat leads (where we
 * captured a real first name + real phone but have no IG handle) prefer
 * full_name > phone > email. For IG/FB leads where full_name is often
 * the IG bio (or missing) we still want full_name first but fall back
 * to instagram_username so older IG-DM-originated leads still render.
 */
function leadDisplayName(lead: LeadRow): string {
  if (lead.full_name !== null && lead.full_name.trim().length > 0) return lead.full_name.trim();
  if (lead.phone !== null && lead.phone.trim().length > 0) return lead.phone.trim();
  if (lead.email !== null && lead.email.trim().length > 0) return lead.email.trim();
  if (lead.instagram_username !== null && lead.instagram_username.trim().length > 0) {
    return `@${lead.instagram_username.trim()}`;
  }
  return `Lead ${lead.id.slice(0, 8)}`;
}

function initialsForName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "LD";
}

function sourceFromChannel(channel: LeadRow["source_channel"]): LeadPageSource {
  if (channel === "public_listing_chat") return "listing_chat";
  if (channel === "call") return "voice";
  if (channel === "manual" || channel === "csv_import") return "manual";
  if (channel.startsWith("facebook")) return "facebook";
  if (channel.startsWith("instagram")) return "instagram";
  return "manual";
}

function stageFromLead(lead: LeadRow): LeadPageStage {
  const actionability = classifyHarwickLeadActionability({
    sourceChannel: lead.source_channel,
    status: lead.status,
    intent: lead.intent,
    score: lead.score,
    assignedAgentId: lead.assigned_agent_id,
    nextFollowUpAt: lead.next_followup_at,
    followUpBossContactId: lead.follow_up_boss_contact_id,
  });

  if (actionability.state === "callback") return "callback";
  if (lead.status === "appointment_booked") return "showing";
  if (actionability.state === "nurture") return "nurture";
  if (lead.status === "hot" || lead.score >= 70 || lead.intent === "high") return "hot";
  if (actionability.state === "qualified" && lead.assigned_agent_id === null) return "unrouted";
  return "qualified";
}

function stageLabel(stage: LeadPageStage, lead: LeadRow): string {
  if (lead.lead_type === "seller") return "seller lead";
  if (stage === "hot") return "hot buyer";
  if (stage === "callback") return "callback";
  if (stage === "nurture") return "nurture";
  if (stage === "showing") return "showing";
  if (stage === "qualified") return "qualified";
  return "owner review";
}

function formatBudget(lead: LeadRow): string {
  if (lead.budget_min === null && lead.budget_max === null) return "unknown";
  if (lead.budget_min !== null && lead.budget_max !== null) return `$${Math.round(lead.budget_min / 1000)}k-$${Math.round(lead.budget_max / 1000)}k`;
  if (lead.budget_min !== null) return `$${Math.round(lead.budget_min / 1000)}k+`;
  return `up to $${Math.round((lead.budget_max ?? 0) / 1000)}k`;
}

function sourceDetail(lead: LeadRow): string {
  if (lead.source_channel === "public_listing_chat") return "listing chat";
  if (lead.source_channel === "instagram_comment") return "instagram comment";
  if (lead.source_channel === "instagram_dm") return "instagram dm";
  if (lead.source_channel === "facebook_comment") return "facebook comment";
  if (lead.source_channel === "facebook_dm") return "facebook dm";
  if (lead.source_channel === "call") return "voice call";
  if (lead.source_channel === "sms") return "sms";
  if (lead.source_channel === "csv_import") return "imported";
  if (lead.source_channel === "manual") return "manual";
  // All enum members are covered above; TypeScript narrows to `never` here.
  // The cast is defensive in case the union grows.
  return String(lead.source_channel).replace(/_/g, " ");
}

function relativeLastTouch(lead: LeadRow): string {
  if (lead.last_message_at === null) return "no touch";
  return new Date(lead.last_message_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function loadLeadsPageData(params: {
  workspaceId: string;
  viewer: LeadsPageViewer;
  repository: LeadsPageRepository;
  limit?: number;
}): Promise<LeadsPageData> {
  const limit = Math.min(params.limit ?? 50, 100);
  const [leads, members, listings] = await Promise.all([
    params.repository.listLeads(params.workspaceId, limit, params.viewer),
    params.repository.listWorkspaceMembers(params.workspaceId),
    params.repository.listListingFacts(params.workspaceId, 25),
  ]);
  const membersById = new Map(members.map((member) => [member.id, member]));
  const firstListing = listings[0]?.address ?? "no listing matched";

  const actionableLeads = leads.filter((lead) => {
    if (
      !workspaceRoleHasCapability(params.viewer.role as WorkspaceRole, "leads.read_all")
      && lead.assigned_agent_id !== params.viewer.memberId
    ) {
      return false;
    }

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

  const items = await Promise.all(actionableLeads.map(async (lead): Promise<LeadPageItem> => {
    const name = leadDisplayName(lead);
    const stage = stageFromLead(lead);
    const assignedMember = lead.assigned_agent_id === null ? null : (membersById.get(lead.assigned_agent_id) ?? null);
    const message = await params.repository.findLatestLeadMessage({
      workspaceId: params.workspaceId,
      leadId: lead.id,
    });
    const review = await params.repository.findLatestSocialReviewForLead({
      workspaceId: params.workspaceId,
      leadId: lead.id,
    });
    const actionability = classifyHarwickLeadActionability({
      sourceChannel: lead.source_channel,
      status: lead.status,
      intent: lead.intent,
      score: lead.score,
      assignedAgentId: lead.assigned_agent_id,
      nextFollowUpAt: lead.next_followup_at,
      followUpBossContactId: lead.follow_up_boss_contact_id,
    });

    return {
      id: lead.id,
      workspaceId: params.workspaceId,
      name,
      initials: initialsForName(name),
      phone: lead.phone,
      source: sourceFromChannel(lead.source_channel),
      sourceDetail: sourceDetail(lead),
      stage,
      stageLabel: stageLabel(stage, lead),
      cardKind: lead.lead_type === "seller" ? "seller" : firstListing === "no listing matched" ? "area" : "listing",
      intent: lead.lead_type,
      leadType: lead.lead_type,
      intentLevel: lead.intent,
      score: lead.score,
      budget: formatBudget(lead),
      area: lead.target_area ?? "unknown",
      timeline: lead.timeline ?? "unknown",
      propertyType: lead.lead_type === "renter" ? "lease" : lead.lead_type === "seller" ? "seller" : "home search",
      financingStatus: lead.financing_status,
      assignedTo: assignedMember?.display_name ?? (lead.assigned_agent_id === null ? "owner review" : "assigned agent"),
      assignedMemberId: lead.assigned_agent_id,
      sourceOwner: "workspace",
      lastTouch: relativeLastTouch(lead),
      routeReason: assignedMember === null
        ? `${actionability.reason} no assigned member is set yet.`
        : `${actionability.reason} ${assignedMember.display_name} owns the next step.`,
      listing: firstListing,
      message: message ?? "No conversation text has been captured for this lead yet.",
      reviewId: review?.id ?? null,
      automationMode: review?.automationMode ?? null,
      automationReason: review?.automationReason ?? null,
      qualificationSummary: lead.qualification_summary ?? null,
      leadDocument: lead.lead_document ?? null,
    };
  }));

  return { workspaceId: params.workspaceId, items };
}
