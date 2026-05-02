import { classifyHarwickLeadActionability, workspaceRoleHasCapability } from "@realty-ops/core";
import type { ConversationAutomationMode } from "@realty-ops/core";
import type { WorkspaceMemberRow } from "../../lib/supabase/database.types";
import type { LeadRow } from "../../lib/supabase/leads";
import type { ListingFactRow } from "../../lib/supabase/listings";

export type LeadPageSource = "instagram" | "facebook" | "voice";
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
  score: number;
  budget: string;
  area: string;
  timeline: string;
  propertyType: string;
  assignedTo: string;
  sourceOwner: string;
  lastTouch: string;
  routeReason: string;
  listing: string;
  message: string;
  reviewId: string | null;
  automationMode: ConversationAutomationMode | null;
  automationReason: string | null;
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
  if (channel === "call") return "voice";
  if (channel.startsWith("facebook")) return "facebook";
  return "instagram";
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
  if (lead.source_channel === "instagram_comment") return "instagram comment";
  if (lead.source_channel === "instagram_dm") return "instagram dm";
  if (lead.source_channel === "facebook_comment") return "facebook comment";
  if (lead.source_channel === "facebook_dm") return "facebook dm";
  if (lead.source_channel === "call") return "voice call";
  return lead.source_channel.replace("_", " ");
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
      !workspaceRoleHasCapability(params.viewer.role, "leads.read_all")
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
    const name = lead.full_name ?? lead.instagram_username ?? lead.phone ?? "unknown lead";
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
      score: lead.score,
      budget: formatBudget(lead),
      area: lead.target_area ?? "unknown",
      timeline: lead.timeline ?? "unknown",
      propertyType: lead.lead_type === "renter" ? "lease" : lead.lead_type === "seller" ? "seller" : "home search",
      assignedTo: assignedMember?.display_name ?? (lead.assigned_agent_id === null ? "owner review" : "assigned agent"),
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
    };
  }));

  return { workspaceId: params.workspaceId, items };
}
