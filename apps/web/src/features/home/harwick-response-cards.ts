import type {
  HarwickAiToolCall,
  HarwickResponseCard,
  RecentLeadItem,
  RoutingDeskItem,
  TeamPresenceMember,
} from "@realty-ops/core";

type CardBuildParams = {
  message: string;
  recentLeads: RecentLeadItem[];
  routingDesk: RoutingDeskItem[];
  teamPresence: TeamPresenceMember[];
  toolCalls: HarwickAiToolCall[];
};

function lower(value: string): string {
  return value.toLowerCase();
}

function matchesAny(haystack: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(haystack));
}

function leadSource(lead: RecentLeadItem): "instagram" | "facebook" | "voice" | "operations" | "follow_up_boss" | "other" {
  if (lead.source === "instagram" || lead.source === "facebook" || lead.source === "voice") return lead.source;
  return "other";
}

function leadListFromRecent(recent: RecentLeadItem[], filter: "hot" | "all" | "needs-routing"): HarwickResponseCard | null {
  let items = recent.slice();
  if (filter === "hot") {
    items = items.filter((lead) => lead.stage === "new" || lead.stage === "qualified" || lead.stage === "review");
  } else if (filter === "needs-routing") {
    items = items.filter((lead) => lead.assignedDisplayName === null);
  }
  if (items.length === 0) return null;

  return {
    kind: "lead-list",
    title: filter === "hot" ? "Hot leads" : filter === "needs-routing" ? "Leads needing routing" : "Recent leads",
    summary: filter === "hot"
      ? `${items.length} ${items.length === 1 ? "lead" : "leads"} ready for attention.`
      : filter === "needs-routing"
        ? `${items.length} unassigned.`
        : null,
    items: items.slice(0, 8).map((lead) => ({
      leadId: lead.id,
      name: lead.name,
      source: leadSource(lead),
      status: lead.stageLabel,
      scoreLabel: null,
      reason: lead.assignedDisplayName === null
        ? `Last touch ${lead.lastTouchLabel} · unassigned`
        : `Last touch ${lead.lastTouchLabel} · with ${lead.assignedDisplayName}`,
      lastTouchLabel: lead.lastTouchLabel,
      actions: [
        { label: "Open lead", href: `/leads?leadId=${lead.id}`, intent: "primary" as const },
        { label: "See convo", href: `/conversations?leadId=${lead.id}`, intent: "ghost" as const },
      ],
    })),
  };
}

function routingCardFromDesk(desk: RoutingDeskItem[]): HarwickResponseCard | null {
  if (desk.length === 0) return null;
  return {
    kind: "routing-decisions",
    title: "Routing desk",
    items: desk.slice(0, 6).map((item) => ({
      leadId: item.leadId,
      leadName: item.leadName,
      fromMember: null,
      toMember: item.decision.assignedDisplayName ?? "owner review",
      reason: item.decision.reasons[0] ?? item.summary ?? item.decision.taskLabel,
      requiresApproval: item.decision.status !== "assigned",
    })),
  };
}

function teamCardFromPresence(team: TeamPresenceMember[]): HarwickResponseCard | null {
  if (team.length === 0) return null;
  return {
    kind: "team-status",
    title: "Team",
    members: team.slice(0, 12).map((member) => ({
      memberId: member.id,
      name: member.name,
      role: member.roleLabel,
      status: member.status === "in_call" ? "online" as const : member.status,
      openWork: member.openWork,
      capacity: null,
    })),
  };
}

function approvalsCardFromTools(toolCalls: HarwickAiToolCall[]): HarwickResponseCard | null {
  const approval = toolCalls.filter((call) => call.requiresApproval);
  if (approval.length === 0) return null;
  return {
    kind: "approvals",
    title: "Waiting on your approval",
    items: approval.slice(0, 6).map((call) => ({
      tool: call.tool,
      summary: call.reason,
      payloadPreview: Object.entries(call.payload)
        .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
        .slice(0, 3)
        .join(" · ") || null,
      riskNote: null,
    })),
  };
}

/** Decide which response cards to emit for this turn.
 *
 * Strategy: read the operator's intent from the message + the model's tool
 * calls, then enrich with the raw workspace data the route already loaded.
 * The model writes prose; the card builder makes the prose actionable. */
export function buildHarwickResponseCards(params: CardBuildParams): HarwickResponseCard[] {
  const cards: HarwickResponseCard[] = [];
  const msg = lower(params.message);

  const wantsHot = matchesAny(msg, [/hot lead/i, /leads to (see|review|attend)/i, /need (to|me) see/i, /priority lead/i]);
  const wantsRouting = matchesAny(msg, [/routing/i, /route /i, /who should (take|own|handle)/i, /assign(ed)? to/i, /unassigned/i]);
  const wantsTeam = matchesAny(msg, [/team/i, /who('s| is) (free|available|online)/i, /capacity/i, /workload/i]);
  const wantsLeadsGeneric = matchesAny(msg, [/^show me( the)? leads?/i, /^list (the )?leads?/i, /my leads?/i, /recent leads?/i]);

  if (wantsHot) {
    const card = leadListFromRecent(params.recentLeads, "hot");
    if (card !== null) cards.push(card);
  } else if (wantsRouting) {
    const routingCard = routingCardFromDesk(params.routingDesk);
    if (routingCard !== null) cards.push(routingCard);
    const needsRoutingCard = leadListFromRecent(params.recentLeads, "needs-routing");
    if (needsRoutingCard !== null) cards.push(needsRoutingCard);
  } else if (wantsTeam) {
    const card = teamCardFromPresence(params.teamPresence);
    if (card !== null) cards.push(card);
  } else if (wantsLeadsGeneric) {
    const card = leadListFromRecent(params.recentLeads, "all");
    if (card !== null) cards.push(card);
  }

  // Always show approvals card when the model queued anything for approval.
  const approvalsCard = approvalsCardFromTools(params.toolCalls);
  if (approvalsCard !== null) cards.push(approvalsCard);

  return cards;
}
