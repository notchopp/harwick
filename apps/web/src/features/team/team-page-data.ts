import type {
  ConversationInboxThread,
  RecentLeadItem,
  RoutingDeskItem,
  TeamPresenceMember,
} from "@realty-ops/core";

export type TeamWorkspaceMessage = {
  authorId: string | null;
  authorLabel: string;
  body: string;
  createdAt: string;
  id: string;
  kind: "member" | "harwick" | "system";
  tone: "card" | "muted" | "plain";
};

export type TeamWorkspaceThread = {
  description: string;
  id: string;
  kind: "channel" | "direct";
  memberIds: string[];
  messages: TeamWorkspaceMessage[];
  title: string;
  unreadCount: number;
};

function message(
  partial: Omit<TeamWorkspaceMessage, "id">,
  suffix: string,
): TeamWorkspaceMessage {
  return {
    ...partial,
    id: `${suffix}:${partial.kind}:${partial.createdAt}`,
  };
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function activeMemberLabel(members: TeamPresenceMember[]): string {
  const online = members.filter((member) => member.status !== "away");
  if (online.length === 0) return "Everyone looks offline right now";
  if (online.length === 1) return `${firstName(online[0]!.name)} is active now`;
  return `${firstName(online[0]!.name)} and ${online.length - 1} others are active now`;
}

function hottestLeadLine(recentLeads: RecentLeadItem[]): string {
  const hottest = recentLeads[0];
  if (hottest === undefined) {
    return "No new inbound lead is pressing right now.";
  }
  return `${firstName(hottest.name)} came in through ${hottest.sourceLabel.toLowerCase()} and is still sitting in ${hottest.stageLabel.toLowerCase()}.`;
}

function routingLine(routing: RoutingDeskItem[]): string {
  const item = routing[0];
  if (item === undefined) {
    return "Routing is quiet right now.";
  }
  const assigned = item.decision.assignedDisplayName ?? "owner review";
  return `${item.leadName} looks best for ${assigned} because ${item.decision.reasons[0] ?? item.summary}.`;
}

function draftLine(conversations: ConversationInboxThread[]): string {
  const pending = conversations.filter((thread) => thread.reviewId !== null).length;
  if (pending === 0) {
    return "No approvals are waiting in the queue.";
  }
  return `${pending} conversation${pending === 1 ? "" : "s"} still need approval or send review.`;
}

export function buildHarwickAmbientReply(params: {
  conversations: ConversationInboxThread[];
  members: TeamPresenceMember[];
  recentLeads: RecentLeadItem[];
  routing: RoutingDeskItem[];
  text: string;
  threadTitle: string;
  workspaceName: string;
}): string {
  const normalized = params.text.trim().toLowerCase();
  const online = params.members.filter((member) => member.status !== "away");
  const busiest = [...params.members].sort((left, right) => right.openWork - left.openWork)[0] ?? null;
  const hottestLead = params.recentLeads[0] ?? null;
  const routingItem = params.routing[0] ?? null;

  if (normalized.includes("route")) {
    return routingItem === null
      ? "Routing looks clear right now. Nothing is stuck in owner review."
      : `The next routing call I would watch is ${routingItem.leadName}. ${routingItem.decision.reasons[0] ?? routingItem.summary}.`;
  }

  if (normalized.includes("lead") || normalized.includes("priority") || normalized.includes("urgent")) {
    return hottestLead === null
      ? "Nothing has turned hot since the last pass. I would keep eyes on follow-up timing instead."
      : `${firstName(hottestLead.name)} is the first place I would look. ${hottestLead.stageLabel} from ${hottestLead.sourceLabel} and last touched ${hottestLead.lastTouchLabel}.`;
  }

  if (normalized.includes("who") || normalized.includes("team")) {
    return online.length === 0
      ? `I do not see anyone active in ${params.workspaceName} right now, so I would keep the next reply tight and leave a clear handoff note.`
      : `${activeMemberLabel(params.members)}. ${busiest === null ? "Open work is quiet." : `${firstName(busiest.name)} is carrying the heaviest board with ${busiest.openWork} open work items.`}`;
  }

  return `${hottestLeadLine(params.recentLeads)} ${routingLine(params.routing)} ${draftLine(params.conversations)} I can keep watching ${params.threadTitle.toLowerCase()} and drop context here when something changes.`;
}

export function buildTeamWorkspaceThreads(params: {
  conversations: ConversationInboxThread[];
  members: TeamPresenceMember[];
  nowIso?: string;
  recentLeads: RecentLeadItem[];
  routing: RoutingDeskItem[];
  workspaceName: string;
}): TeamWorkspaceThread[] {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const owner = params.members[0] ?? null;
  const directSeeds = params.members.slice(0, 2);
  const leadDeskPartner = directSeeds[0] ?? owner;

  const generalMessages: TeamWorkspaceMessage[] = [
    message({
      authorId: null,
      authorLabel: "System",
      body: "General is where the whole workspace can talk through live work. Harwick stays in the room and can jump in with context when needed.",
      createdAt: nowIso,
      kind: "system",
      tone: "muted",
    }, "general"),
    ...(owner === null ? [] : [
      message({
        authorId: owner.id,
        authorLabel: owner.name,
        body: `Morning. Keep response time tight today. I want routing to stay clean if anything turns hot.`,
        createdAt: nowIso,
        kind: "member",
        tone: "plain",
      }, "general"),
    ]),
    message({
      authorId: null,
      authorLabel: "Harwick",
      body: `${hottestLeadLine(params.recentLeads)} ${draftLine(params.conversations)}`,
      createdAt: nowIso,
      kind: "harwick",
      tone: "card",
    }, "general"),
  ];

  const leadDeskMessages: TeamWorkspaceMessage[] = [
    ...(leadDeskPartner === null ? [] : [
      message({
        authorId: leadDeskPartner.id,
        authorLabel: leadDeskPartner.name,
        body: `If another buyer lands in my zone today, tag me here before we move it.`,
        createdAt: nowIso,
        kind: "member",
        tone: "plain",
      }, "lead-desk"),
    ]),
    message({
      authorId: null,
      authorLabel: "Harwick",
      body: routingLine(params.routing),
      createdAt: nowIso,
      kind: "harwick",
      tone: "card",
    }, "lead-desk"),
  ];

  const watchMessages: TeamWorkspaceMessage[] = [
    message({
      authorId: null,
      authorLabel: "Harwick",
      body: buildHarwickAmbientReply({
        conversations: params.conversations,
        members: params.members,
        recentLeads: params.recentLeads,
        routing: params.routing,
        text: "priority update",
        threadTitle: "Harwick watch",
        workspaceName: params.workspaceName,
      }),
      createdAt: nowIso,
      kind: "harwick",
      tone: "card",
    }, "harwick-watch"),
  ];

  const directThreads = directSeeds
    .map((member, index) => ({
      id: `direct:${member.id}`,
      kind: "direct" as const,
      title: member.name,
      description: `${member.roleLabel} · ${member.lastSeen}`,
      memberIds: [member.id],
      unreadCount: index === 0 ? 1 : 0,
      messages: [
        message({
          authorId: member.id,
          authorLabel: member.name,
          body: member.openWork > 0
            ? `I am carrying ${member.openWork} open items right now. Pull me in if another one gets messy.`
            : `I am clear right now if something new needs hands.`,
          createdAt: nowIso,
          kind: "member",
          tone: "plain",
        }, `direct:${member.id}`),
        message({
          authorId: null,
          authorLabel: "Harwick",
          body: `Got it. I will keep an eye on anything that should route your way and drop a note here if the signal changes.`,
          createdAt: nowIso,
          kind: "harwick",
          tone: "card",
        }, `direct:${member.id}`),
      ],
    }));

  return [
    {
      id: "channel:general",
      kind: "channel",
      title: "General",
      description: activeMemberLabel(params.members),
      memberIds: params.members.map((member) => member.id),
      unreadCount: 2,
      messages: generalMessages,
    },
    {
      id: "channel:lead-desk",
      kind: "channel",
      title: "Lead desk",
      description: `${params.routing.length} routing call${params.routing.length === 1 ? "" : "s"} in view`,
      memberIds: params.members.map((member) => member.id),
      unreadCount: params.routing.length > 0 ? 1 : 0,
      messages: leadDeskMessages,
    },
    {
      id: "channel:harwick-watch",
      kind: "channel",
      title: "Harwick watch",
      description: "Harwick drops operating notes and proactive cards here",
      memberIds: params.members.map((member) => member.id),
      unreadCount: 0,
      messages: watchMessages,
    },
    ...directThreads,
  ];
}
