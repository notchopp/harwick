import type { LeadPageItem, LeadPageStage } from "./leads-data";

export type LeadPipelineMetric = {
  count: number;
  description: string;
  id: LeadPageStage;
  label: string;
  tone: "alert" | "warm" | "ready" | "steady";
};

export type LeadAgentSnapshot = {
  hotCount: number;
  initials: string;
  name: string;
  totalCount: number;
};

const stageMeta: Record<LeadPageStage, Omit<LeadPipelineMetric, "count">> = {
  hot: {
    id: "hot",
    label: "Hot",
    description: "Needs the fastest next move",
    tone: "alert",
  },
  qualified: {
    id: "qualified",
    label: "Qualified",
    description: "Clear intent and routing in place",
    tone: "ready",
  },
  unrouted: {
    id: "unrouted",
    label: "Owner review",
    description: "Still waiting on routing context",
    tone: "warm",
  },
  callback: {
    id: "callback",
    label: "Callback",
    description: "Human contact should happen first",
    tone: "warm",
  },
  nurture: {
    id: "nurture",
    label: "Nurture",
    description: "Warm follow-up keeps momentum alive",
    tone: "steady",
  },
  showing: {
    id: "showing",
    label: "Showing",
    description: "Ready for calendar coordination",
    tone: "ready",
  },
};

function initialsForAgent(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "HW";
}

export function buildLeadPipelineMetrics(leads: Pick<LeadPageItem, "stage">[]): LeadPipelineMetric[] {
  const counts = new Map<LeadPageStage, number>();
  for (const lead of leads) {
    counts.set(lead.stage, (counts.get(lead.stage) ?? 0) + 1);
  }

  return (Object.keys(stageMeta) as LeadPageStage[]).map((stage) => ({
    ...stageMeta[stage],
    count: counts.get(stage) ?? 0,
  }));
}

export function buildLeadAgentSnapshots(
  leads: Pick<LeadPageItem, "assignedTo" | "stage">[],
  limit = 4,
): LeadAgentSnapshot[] {
  const byAgent = new Map<string, LeadAgentSnapshot>();

  for (const lead of leads) {
    const name = lead.assignedTo.trim();
    if (name.length === 0 || name === "owner review") {
      continue;
    }

    const existing = byAgent.get(name) ?? {
      name,
      initials: initialsForAgent(name),
      totalCount: 0,
      hotCount: 0,
    };

    existing.totalCount += 1;
    if (lead.stage === "hot" || lead.stage === "callback") {
      existing.hotCount += 1;
    }

    byAgent.set(name, existing);
  }

  return [...byAgent.values()]
    .sort((left, right) => {
      if (right.hotCount !== left.hotCount) return right.hotCount - left.hotCount;
      if (right.totalCount !== left.totalCount) return right.totalCount - left.totalCount;
      return left.name.localeCompare(right.name);
    })
    .slice(0, Math.max(1, limit));
}
