import type {
  ConversationInboxMessage,
  ConversationInboxSource,
  ConversationInboxStageTone,
  ConversationInboxThread,
} from "@realty-ops/core";

type SandboxThreadInput = {
  id: string;
  name: string;
  source: ConversationInboxSource;
  channelLabel: string;
  sourceContext: string;
  bucket: ConversationInboxThread["bucket"];
  assignedTo: string;
  stageLabel: string;
  stageTone: ConversationInboxStageTone;
  score: number;
  followUpBossContactId: string | null;
  intentType: string;
  area: string;
  timeline: string;
  budget: string;
  listingTitle: string;
  listingDetails: string;
  listingStatus: string;
  automationMode: ConversationInboxThread["automationMode"];
  automationReason: string | null;
  messages: Array<{
    id: string;
    kind: ConversationInboxMessage["kind"];
    body: string;
    meta: string;
    occurredAt: string;
  }>;
};

export const conversationSandboxPromptLibrary = [
  {
    id: "price-details",
    label: "Price + details",
    message: "What is the price and can you send more details on this one?",
  },
  {
    id: "showing-request",
    label: "Book a tour",
    message: "Can I see it this Friday after 5? We are serious if it fits our budget.",
  },
  {
    id: "just-browsing",
    label: "Just browsing",
    message: "I am just browsing right now and not ready yet. Can you still send me options?",
  },
  {
    id: "financing",
    label: "Financing",
    message: "How much down payment would I need and do I have to be pre-approved first?",
  },
  {
    id: "blueprint",
    label: "Buyer blueprint",
    message: "Can you send me the buyer blueprint and a few homes in Weston under 850k?",
  },
  {
    id: "handoff",
    label: "Needs handoff",
    message: "Can you guarantee I can lock a 5.5% rate this week and tell me the legal steps?",
  },
  {
    id: "identity",
    label: "Who are you?",
    message: "Wait so who are you exactly?",
  },
  {
    id: "legit-check",
    label: "Is this legit?",
    message: "How do I know this is legit and not spam?",
  },
  {
    id: "not-preapproved",
    label: "Not preapproved",
    message: "I am not preapproved yet. Can I still look at places?",
  },
  {
    id: "relocating",
    label: "Relocating",
    message: "We are relocating from New Jersey and need help figuring out the right areas for our family.",
  },
] as const;

function initialsForName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "LD";
}

function formatShortRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "now";
  if (diffMs < 60 * 60_000) return `${Math.max(1, Math.round(diffMs / 60_000))}m`;
  if (diffMs < 24 * 60 * 60_000) return `${Math.max(1, Math.round(diffMs / (60 * 60_000)))}h`;
  return `${Math.max(1, Math.round(diffMs / (24 * 60 * 60_000)))}d`;
}

function buildSandboxThread(workspaceId: string, thread: SandboxThreadInput): ConversationInboxThread {
  return {
    id: thread.id,
    workspaceId,
    leadId: thread.id,
    reviewId: null,
    name: thread.name,
    initials: initialsForName(thread.name),
    lastTouchLabel: formatShortRelative(thread.messages[thread.messages.length - 1]?.occurredAt ?? new Date().toISOString()),
    unread: false,
    preview: thread.messages[thread.messages.length - 1]?.body ?? "No conversation captured yet.",
    source: thread.source,
    sourceLabel: thread.source === "manual" ? "Manual" : thread.source.charAt(0).toUpperCase() + thread.source.slice(1),
    channelLabel: thread.channelLabel,
    sourceContext: thread.sourceContext,
    bucket: thread.bucket,
    assignedTo: thread.assignedTo,
    stageLabel: thread.stageLabel,
    stageTone: thread.stageTone,
    score: thread.score,
    scoreLabel: `${thread.score} / 100`,
    followUpBossContactId: thread.followUpBossContactId,
    intentType: thread.intentType,
    area: thread.area,
    timeline: thread.timeline,
    budget: thread.budget,
    listingTitle: thread.listingTitle,
    listingDetails: thread.listingDetails,
    listingStatus: thread.listingStatus,
    automationMode: thread.automationMode,
    automationReason: thread.automationReason,
    aiSynthesis: null,
    messages: thread.messages.map((message) => ({
      id: message.id,
      kind: message.kind,
      body: message.body,
      meta: message.meta,
      occurredAt: message.occurredAt,
    })),
  };
}

const sandboxThreads: SandboxThreadInput[] = [
  {
    id: "123e4567-e89b-42d3-a456-426614174301",
    name: "Taylor Brooks",
    source: "instagram",
    channelLabel: "DM",
    sourceContext: "Sandbox · Instagram DM · Price and listing details",
    bucket: "dms",
    assignedTo: "Sarah Kim",
    stageLabel: "Qualified",
    stageTone: "qualified",
    score: 88,
    followUpBossContactId: null,
    intentType: "Purchase",
    area: "Coral Gables",
    timeline: "30-60 days",
    budget: "$900k-$1.1M",
    listingTitle: "Coral Gables family home",
    listingDetails: "$998k · 4bd / 3ba · Pool · Near Miracle Mile",
    listingStatus: "Sandbox scenario",
    automationMode: "ai_on",
    automationReason: "Sandbox scenario seeded from common buyer DM questions around price and listing details.",
    messages: [
      {
        id: "sandbox-taylor-lead-1",
        kind: "lead",
        body: "Hey is the Coral Gables one still on the market and what is the price?",
        meta: "11:14 AM · Instagram DM",
        occurredAt: "2026-04-30T15:14:00.000Z",
      },
    ],
  },
  {
    id: "123e4567-e89b-42d3-a456-426614174302",
    name: "Jordan Patel",
    source: "facebook",
    channelLabel: "DM",
    sourceContext: "Sandbox · Facebook DM · Showing request",
    bucket: "dms",
    assignedTo: "Marcus Lee",
    stageLabel: "Qualified",
    stageTone: "qualified",
    score: 92,
    followUpBossContactId: "sandbox-fub-202",
    intentType: "Purchase",
    area: "Brickell",
    timeline: "This week",
    budget: "$850k-$950k",
    listingTitle: "Brickell bay-view condo",
    listingDetails: "$915k · 3bd / 2ba · 1,860 sqft · 2 parking",
    listingStatus: "Sandbox scenario",
    automationMode: "ai_on",
    automationReason: "Sandbox scenario seeded from common tour-booking and move-soon buyer flows.",
    messages: [
      {
        id: "sandbox-jordan-lead-1",
        kind: "lead",
        body: "We like this one a lot. Can we tour it this Friday after 5?",
        meta: "10:02 AM · Facebook DM",
        occurredAt: "2026-04-30T14:02:00.000Z",
      },
      {
        id: "sandbox-jordan-sent-1",
        kind: "sent",
        body: "I can help line that up. What is the best number for the showing confirmation?",
        meta: "10:06 AM · Sent via Facebook DM",
        occurredAt: "2026-04-30T14:06:00.000Z",
      },
      {
        id: "sandbox-jordan-lead-2",
        kind: "lead",
        body: "Sure, 305-555-0143. We are approved up to about 950k.",
        meta: "10:09 AM · Facebook DM",
        occurredAt: "2026-04-30T14:09:00.000Z",
      },
    ],
  },
  {
    id: "123e4567-e89b-42d3-a456-426614174303",
    name: "Maya Campbell",
    source: "instagram",
    channelLabel: "DM",
    sourceContext: "Sandbox · Instagram DM · Just browsing nurture",
    bucket: "dms",
    assignedTo: "Sarah Kim",
    stageLabel: "Nurture",
    stageTone: "nurture",
    score: 54,
    followUpBossContactId: null,
    intentType: "Purchase",
    area: "Kendall",
    timeline: "Flexible",
    budget: "Unknown",
    listingTitle: "Kendall starter-home search",
    listingDetails: "3bd+ options · Family-focused areas · Market watch",
    listingStatus: "Sandbox scenario",
    automationMode: "ai_on",
    automationReason: "Sandbox scenario seeded from common just-browsing buyer objections and nurture follow-up.",
    messages: [
      {
        id: "sandbox-maya-lead-1",
        kind: "lead",
        body: "I am mostly just browsing for now. Not ready to buy yet but I like this area.",
        meta: "8:41 AM · Instagram DM",
        occurredAt: "2026-04-30T12:41:00.000Z",
      },
    ],
  },
  {
    id: "123e4567-e89b-42d3-a456-426614174304",
    name: "Andres Flores",
    source: "facebook",
    channelLabel: "DM",
    sourceContext: "Sandbox · Facebook DM · Financing questions",
    bucket: "dms",
    assignedTo: "Marcus Lee",
    stageLabel: "Owner review",
    stageTone: "review",
    score: 76,
    followUpBossContactId: null,
    intentType: "Purchase",
    area: "Pembroke Pines",
    timeline: "60-90 days",
    budget: "$420k-$500k",
    listingTitle: "Pembroke Pines townhome search",
    listingDetails: "$455k target · 3bd / 2.5ba · FHA-friendly range",
    listingStatus: "Sandbox scenario",
    automationMode: "ai_on",
    automationReason: "Sandbox scenario seeded from common down-payment and preapproval questions.",
    messages: [
      {
        id: "sandbox-andres-lead-1",
        kind: "lead",
        body: "How much down payment would I need for something around 450k and do I need to be pre-approved first?",
        meta: "1:18 PM · Facebook DM",
        occurredAt: "2026-04-30T17:18:00.000Z",
      },
    ],
  },
  {
    id: "123e4567-e89b-42d3-a456-426614174305",
    name: "Nia Washington",
    source: "instagram",
    channelLabel: "Comment",
    sourceContext: "Sandbox · Instagram comment · Blueprint request",
    bucket: "comments",
    assignedTo: "Sarah Kim",
    stageLabel: "New",
    stageTone: "new",
    score: 71,
    followUpBossContactId: null,
    intentType: "Buyer blueprint",
    area: "Weston",
    timeline: "Unknown",
    budget: "$700k-$850k",
    listingTitle: "Weston move-up homes",
    listingDetails: "Blueprint CTA · Family homes · Top school zones",
    listingStatus: "Sandbox scenario",
    automationMode: "ai_on",
    automationReason: "Sandbox scenario seeded from common comment-to-DM blueprint requests.",
    messages: [
      {
        id: "sandbox-nia-lead-1",
        kind: "lead",
        body: "Can you send me the buyer blueprint and a few Weston options?",
        meta: "3:02 PM · Instagram Comment",
        occurredAt: "2026-04-30T19:02:00.000Z",
      },
    ],
  },
  {
    id: "123e4567-e89b-42d3-a456-426614174306",
    name: "Olivia Chen",
    source: "instagram",
    channelLabel: "DM",
    sourceContext: "Sandbox · Instagram DM · Relocating buyer",
    bucket: "dms",
    assignedTo: "Marcus Lee",
    stageLabel: "Qualified",
    stageTone: "qualified",
    score: 84,
    followUpBossContactId: "sandbox-fub-306",
    intentType: "Relocation",
    area: "Weston",
    timeline: "Next 90 days",
    budget: "$700k-$850k",
    listingTitle: "Weston relocation search",
    listingDetails: "4bd family homes · Commute-friendly pockets · Buyer consult ready",
    listingStatus: "Sandbox scenario",
    automationMode: "ai_on",
    automationReason: "Sandbox scenario seeded from relocation buyers asking for area guidance and matching options.",
    messages: [
      {
        id: "sandbox-olivia-lead-1",
        kind: "lead",
        body: "We are moving from New Jersey in about 2 months. Can you send good family areas in Weston under 850k?",
        meta: "4:11 PM · Instagram DM",
        occurredAt: "2026-04-30T20:11:00.000Z",
      },
    ],
  },
  {
    id: "123e4567-e89b-42d3-a456-426614174307",
    name: "Diana Reyes",
    source: "voice",
    channelLabel: "Call",
    sourceContext: "Sandbox · Voice callback summary",
    bucket: "dms",
    assignedTo: "Sarah Kim",
    stageLabel: "Owner review",
    stageTone: "review",
    score: 72,
    followUpBossContactId: null,
    intentType: "Rental",
    area: "Brickell",
    timeline: "This week",
    budget: "$3,500/mo",
    listingTitle: "3BR Brickell rental search",
    listingDetails: "Callback requested · Budget captured · 23m transcript",
    listingStatus: "Sandbox scenario",
    automationMode: null,
    automationReason: "Sandbox voice handoff with a structured summary already captured.",
    messages: [
      {
        id: "sandbox-diana-system",
        kind: "system",
        body: "Voice call summary captured",
        meta: "12:33 PM · Voice Call",
        occurredAt: "2026-04-30T16:33:00.000Z",
      },
      {
        id: "sandbox-diana-sent",
        kind: "sent",
        body: "Callback task created and routed to Sarah Kim.",
        meta: "12:35 PM · Sent via Voice Call",
        occurredAt: "2026-04-30T16:35:00.000Z",
      },
    ],
  },
];

export function buildConversationSandboxThreads(workspaceId: string): ConversationInboxThread[] {
  return sandboxThreads.map((thread) => buildSandboxThread(workspaceId, thread));
}

export function mergeConversationThreadsWithSandbox(
  threads: ConversationInboxThread[],
  workspaceId: string,
): ConversationInboxThread[] {
  const sandboxById = new Map(
    buildConversationSandboxThreads(workspaceId).map((thread) => [thread.id, thread] as const),
  );
  const merged = [...threads];
  for (const thread of sandboxById.values()) {
    if (!merged.some((candidate) => candidate.id === thread.id)) {
      merged.push(thread);
    }
  }
  return merged;
}

export function isConversationSandboxThread(thread: ConversationInboxThread): boolean {
  return thread.sourceContext.startsWith("Sandbox · ");
}

export function appendConversationLeadMessage(
  thread: ConversationInboxThread,
  message: string,
): ConversationInboxThread {
  const trimmedMessage = message.trim();
  if (trimmedMessage.length === 0) {
    return thread;
  }

  const occurredAt = new Date().toISOString();
  const nextMessages = [
    ...thread.messages.filter((entry) => entry.kind !== "ai_action"),
    {
      id: crypto.randomUUID(),
      kind: "lead" as const,
      body: trimmedMessage,
      meta: `${new Date(occurredAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })} · ${thread.sourceLabel} ${thread.channelLabel}`,
      occurredAt,
    },
  ];

  return {
    ...thread,
    preview: trimmedMessage,
    lastTouchLabel: "now",
    unread: true,
    messages: nextMessages,
  };
}
