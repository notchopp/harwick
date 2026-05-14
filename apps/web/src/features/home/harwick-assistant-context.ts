import type {
  RecentLeadItem,
  RoutingDeskItem,
  TeamPresenceMember,
} from "@realty-ops/core";

function joinSummaryParts(parts: Array<string | null | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join(" · ");
}

function firstNonEmpty(items: string[]): string | null {
  return items.find((item) => item.trim().length > 0) ?? null;
}

export function buildHarwickRecentLeadSummary(lead: RecentLeadItem): string {
  return joinSummaryParts([
    `${lead.name} — ${lead.stageLabel}`,
    `${lead.sourceLabel} ${lead.channelLabel}`,
    `last touch ${lead.lastTouchLabel}`,
    lead.assignedDisplayName === null ? "needs routing" : `with ${lead.assignedDisplayName}`,
  ]);
}

export function buildHarwickRoutingSummary(item: RoutingDeskItem): string {
  const topReason = firstNonEmpty(item.decision.reasons);

  return joinSummaryParts([
    `${item.leadName} — recommend ${item.decision.assignedDisplayName ?? "owner review"}`,
    topReason === null ? item.decision.taskLabel : `why ${topReason}`,
    item.summary,
    item.source,
  ]);
}

export function buildHarwickTeamSummary(member: TeamPresenceMember): string {
  return joinSummaryParts([
    `${member.name} — ${member.roleLabel}`,
    member.status,
    `${member.openWork} open work`,
    `${member.activeLeadCount} active lead${member.activeLeadCount === 1 ? "" : "s"}`,
    member.lastSeen,
  ]);
}
