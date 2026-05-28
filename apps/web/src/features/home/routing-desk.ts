import {
  AgentRoutingProfileSchema,
  LeadRoutingQualificationSchema,
  RoutingDeskItemSchema,
  RoutingDeskResponseSchema,
  decideLeadRouting,
  type AgentRoutingProfile,
  type LeadRoutingQualification,
  type RoutingDeskItem,
  type RoutingDeskResponse,
  type RoutingPropertyType,
} from "@realty-ops/core";
import type {
  MemberRoutingProfileRow,
  WorkspaceMemberRow,
} from "../../lib/supabase/database.types";
import type { LeadRow } from "../../lib/supabase/leads";

export type RoutingDeskRepository = {
  listLeadsForRouting(params: {
    workspaceId: string;
    limit: number;
  }): Promise<LeadRow[]>;

  listMemberRoutingProfiles(workspaceId: string): Promise<MemberRoutingProfileRow[]>;

  listMembersByIds(params: {
    workspaceId: string;
    memberIds: string[];
  }): Promise<Pick<WorkspaceMemberRow, "id" | "display_name" | "role" | "role_label">[]>;

  countActiveLeadsByMember(workspaceId: string): Promise<Map<string, number>>;
};

function leadDisplayName(lead: LeadRow): string {
  // Phone > IG: public-chat leads have real phones and no IG handle.
  if (lead.full_name !== null && lead.full_name.trim().length > 0) return lead.full_name.trim();
  if (lead.phone !== null && lead.phone.trim().length > 0) return lead.phone.trim();
  if (lead.email !== null && lead.email.trim().length > 0) return lead.email.trim();
  if (lead.instagram_username !== null && lead.instagram_username.trim().length > 0) {
    return `@${lead.instagram_username.trim()}`;
  }
  return `Lead ${lead.id.slice(0, 8)}`;
}

function sourceLabelForRouting(channel: LeadRow["source_channel"]): string {
  if (channel === "public_listing_chat") return "Listing chat";
  if (channel === "instagram_dm") return "Instagram DM";
  if (channel === "instagram_comment") return "Instagram comment";
  if (channel === "facebook_dm") return "Facebook DM";
  if (channel === "facebook_comment") return "Facebook comment";
  if (channel === "call") return "Voice call";
  if (channel === "sms") return "SMS";
  if (channel === "csv_import") return "Imported";
  return "Manual";
}

/**
 * Smart money formatter: $1,000,000 -> "$1M+", $1,500,000 -> "$1.5M",
 * $325,000 -> "$325k". The "$1000k+" rendering bug came from treating
 * everything as thousands regardless of magnitude.
 */
function formatMoneyShort(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    // Show 1 decimal only if needed (1.5M but 2M).
    return `$${(m % 1 === 0 ? m.toFixed(0) : m.toFixed(1))}M`;
  }
  if (value >= 1_000) {
    return `$${Math.round(value / 1_000)}k`;
  }
  return `$${value}`;
}

function sourceOwnerLabel(params: {
  lead: LeadRow;
  ownerNames: Map<string, string>;
}): string {
  if (params.lead.source_provider_id !== null && params.ownerNames.has(params.lead.source_provider_id)) {
    return params.ownerNames.get(params.lead.source_provider_id) ?? "workspace";
  }
  return "workspace";
}

function safePropertyType(value: string | null): RoutingPropertyType | null {
  if (value === null) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "_");
  const allowed: RoutingPropertyType[] = [
    "single_family",
    "condo",
    "townhome",
    "new_construction",
    "luxury",
    "investment",
    "lease",
    "land",
  ];
  return (allowed as readonly string[]).includes(normalized)
    ? (normalized as RoutingPropertyType)
    : null;
}

function buildSummary(lead: LeadRow): string {
  const parts: string[] = [];
  if (lead.lead_type !== "unknown") parts.push(lead.lead_type);
  if (lead.target_area !== null && lead.target_area.trim().length > 0) parts.push(lead.target_area.trim());
  if (lead.budget_min !== null || lead.budget_max !== null) {
    const min = lead.budget_min === null ? null : formatMoneyShort(lead.budget_min);
    const max = lead.budget_max === null ? null : formatMoneyShort(lead.budget_max);
    if (min !== null && max !== null) parts.push(`${min}-${max}`);
    else if (min !== null) parts.push(`${min}+`);
    else if (max !== null) parts.push(`up to ${max}`);
  }
  if (lead.timeline !== null && lead.timeline.trim().length > 0) parts.push(lead.timeline.trim());

  return parts.length === 0 ? "qualification still pending" : parts.join(", ");
}

function buildQualification(lead: LeadRow): LeadRoutingQualification {
  return LeadRoutingQualificationSchema.parse({
    leadId: lead.id,
    workspaceId: lead.workspace_id,
    leadType: lead.lead_type,
    targetArea: lead.target_area === null || lead.target_area.trim().length === 0
      ? null
      : lead.target_area.trim(),
    propertyType: safePropertyType(null),
    budgetMin: lead.budget_min,
    budgetMax: lead.budget_max,
    timeline: lead.timeline === null || lead.timeline.trim().length === 0
      ? null
      : lead.timeline.trim(),
    financingStatus: lead.financing_status,
    score: lead.score,
    sourceOwnerMemberId: null,
  });
}

function mapProfileToAgent(params: {
  profile: MemberRoutingProfileRow;
  displayName: string;
  activeLeadCount: number;
}): AgentRoutingProfile {
  return AgentRoutingProfileSchema.parse({
    memberId: params.profile.member_id,
    displayName: params.displayName,
    roleLabel: params.profile.role_label,
    areas: params.profile.areas,
    propertyTypes: params.profile.property_types as RoutingPropertyType[],
    leadTypes: params.profile.lead_types.filter(
      (lt: string): lt is "buyer" | "seller" | "renter" | "investor" => lt !== "unknown",
    ),
    budgetMin: params.profile.budget_min,
    budgetMax: params.profile.budget_max,
    activeLeadCount: params.activeLeadCount,
    maxActiveLeads: params.profile.max_active_leads,
    acceptsNewLeads: params.profile.accepts_new_leads,
    notificationPreference: params.profile.notification_preference,
  });
}

export async function loadRoutingDesk(params: {
  workspaceId: string;
  repository: RoutingDeskRepository;
  limit?: number;
}): Promise<RoutingDeskResponse> {
  const limit = params.limit ?? 3;

  const [leads, profiles, activeLeadCounts] = await Promise.all([
    params.repository.listLeadsForRouting({ workspaceId: params.workspaceId, limit }),
    params.repository.listMemberRoutingProfiles(params.workspaceId),
    params.repository.countActiveLeadsByMember(params.workspaceId),
  ]);

  if (profiles.length === 0 || leads.length === 0) {
    return RoutingDeskResponseSchema.parse({
      workspaceId: params.workspaceId,
      agents: [],
      items: [],
    });
  }

  const memberIds = profiles.map((profile) => profile.member_id);
  const members = await params.repository.listMembersByIds({
    workspaceId: params.workspaceId,
    memberIds,
  });
  const memberById = new Map(members.map((member) => [member.id, member]));

  const agents: AgentRoutingProfile[] = profiles.flatMap((profile) => {
    const member = memberById.get(profile.member_id);
    if (member === undefined) return [];
    return [
      mapProfileToAgent({
        profile,
        displayName: member.display_name,
        activeLeadCount: activeLeadCounts.get(profile.member_id) ?? 0,
      }),
    ];
  });

  const ownerNames = new Map<string, string>();
  for (const member of members) {
    ownerNames.set(member.id, member.display_name);
  }

  const items: RoutingDeskItem[] = leads.map((lead) => {
    const qualification = buildQualification(lead);
    const decision = decideLeadRouting({
      qualification,
      agents,
      escalationMemberId: null,
      roundRobinCursorMemberId: null,
    });

    return RoutingDeskItemSchema.parse({
      leadId: lead.id,
      workspaceId: lead.workspace_id,
      leadName: leadDisplayName(lead),
      summary: buildSummary(lead),
      source: sourceLabelForRouting(lead.source_channel),
      sourceOwnerLabel: sourceOwnerLabel({ lead, ownerNames }),
      qualification,
      decision,
    });
  });

  return RoutingDeskResponseSchema.parse({
    workspaceId: params.workspaceId,
    agents,
    items,
  });
}
