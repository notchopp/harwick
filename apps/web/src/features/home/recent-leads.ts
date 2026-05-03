import {
  RecentLeadItemSchema,
  RecentLeadsResponseSchema,
  type RecentLeadItem,
  type RecentLeadSource,
  type RecentLeadStageTone,
  type RecentLeadsResponse,
} from "@realty-ops/core";
import type { LeadRow } from "../../lib/supabase/leads";

export type RecentLeadsRepository = {
  listRecentLeads(params: {
    workspaceId: string;
    limit: number;
  }): Promise<LeadRow[]>;

  findMembersDisplayNamesByIds(params: {
    workspaceId: string;
    memberIds: string[];
  }): Promise<Map<string, string>>;
};

function initialsForName(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "LD"
  );
}

function sourceFromChannel(channel: LeadRow["source_channel"]): RecentLeadSource {
  if (channel === "call") return "voice";
  if (channel === "sms") return "sms";
  if (channel === "manual" || channel === "csv_import") return "manual";
  if (channel.startsWith("facebook")) return "facebook";
  return "instagram";
}

function sourceLabel(source: RecentLeadSource): string {
  if (source === "voice") return "Voice";
  if (source === "sms") return "SMS";
  if (source === "manual") return "Manual";
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function channelLabel(channel: LeadRow["source_channel"]): string {
  if (channel === "instagram_dm" || channel === "facebook_dm") return "DM";
  if (channel === "instagram_comment" || channel === "facebook_comment") return "Comment";
  if (channel === "call") return "Call";
  if (channel === "sms") return "SMS";
  if (channel === "csv_import") return "Imported";
  return "Manual";
}

function stageTone(lead: LeadRow): RecentLeadStageTone {
  if (lead.status === "nurture") return "nurture";
  if (lead.status === "closed_lost" || lead.status === "archived") return "lost";
  if (
    lead.status === "qualified"
    || lead.status === "hot"
    || lead.status === "assigned"
    || lead.status === "appointment_booked"
    || lead.status === "active_client"
  ) {
    return "qualified";
  }
  if (lead.assigned_agent_id === null && lead.score >= 70) return "review";
  return "new";
}

function stageLabel(tone: RecentLeadStageTone): string {
  if (tone === "qualified") return "Qualified";
  if (tone === "nurture") return "Nurture";
  if (tone === "lost") return "Lost";
  if (tone === "review") return "Owner review";
  return "New";
}

export function relativeTimeLabel(occurredAt: string | null, now: Date): string {
  if (occurredAt === null) {
    return "no activity";
  }

  const diffMs = now.getTime() - new Date(occurredAt).getTime();
  if (Number.isNaN(diffMs) || diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;

  return new Date(occurredAt).toISOString().slice(0, 10);
}

function leadDisplayName(lead: LeadRow): string {
  if (lead.full_name !== null && lead.full_name.trim().length > 0) return lead.full_name.trim();
  if (lead.instagram_username !== null && lead.instagram_username.trim().length > 0) {
    return `@${lead.instagram_username.trim()}`;
  }
  if (lead.email !== null && lead.email.trim().length > 0) return lead.email.trim();
  if (lead.phone !== null && lead.phone.trim().length > 0) return lead.phone.trim();
  return `Lead ${lead.id.slice(0, 8)}`;
}

export async function loadRecentLeads(params: {
  workspaceId: string;
  repository: RecentLeadsRepository;
  limit?: number;
  now?: () => Date;
}): Promise<RecentLeadsResponse> {
  const limit = params.limit ?? 5;
  const now = params.now?.() ?? new Date();

  const leads = await params.repository.listRecentLeads({
    workspaceId: params.workspaceId,
    limit,
  });

  const assignedMemberIds = leads
    .map((lead) => lead.assigned_agent_id)
    .filter((id): id is string => id !== null);
  const memberNames = assignedMemberIds.length === 0
    ? new Map<string, string>()
    : await params.repository.findMembersDisplayNamesByIds({
        workspaceId: params.workspaceId,
        memberIds: assignedMemberIds,
      });

  const items: RecentLeadItem[] = leads.map((lead) => {
    const source = sourceFromChannel(lead.source_channel);
    const tone = stageTone(lead);
    const name = leadDisplayName(lead);
    const occurredAt = lead.last_message_at ?? lead.updated_at ?? lead.created_at;

    return RecentLeadItemSchema.parse({
      id: lead.id,
      workspaceId: lead.workspace_id,
      name,
      initials: initialsForName(name),
      source,
      sourceLabel: sourceLabel(source),
      channelLabel: channelLabel(lead.source_channel),
      stage: tone,
      stageLabel: stageLabel(tone),
      lastTouchAt: occurredAt ?? null,
      lastTouchLabel: relativeTimeLabel(occurredAt, now),
      assignedDisplayName: lead.assigned_agent_id === null
        ? null
        : memberNames.get(lead.assigned_agent_id) ?? null,
    });
  });

  return RecentLeadsResponseSchema.parse({
    workspaceId: params.workspaceId,
    items,
  });
}
