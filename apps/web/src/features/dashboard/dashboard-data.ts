import {
  AtSign,
  BadgeCheck,
  Bot,
  Clock3,
  MessageSquareText,
  PhoneCall,
  RotateCw,
  type LucideIcon,
} from "lucide-react";

export type Metric = {
  label: string;
  value: string;
  note: string;
  tone: "neutral" | "hot" | "qualified" | "syncing";
};

export type Lead = {
  name: string;
  channel: string;
  channelIcon: LucideIcon;
  intent: string;
  status: "hot" | "warm" | "qualified" | "syncing";
  score: number;
  assignee: string;
  sla: string;
  summary: string;
};

export type PipelineStage = {
  label: string;
  count: number;
  detail: string;
};

export type Integration = {
  name: string;
  status: string;
  state: "qualified" | "warm" | "syncing";
  description: string;
};

export type VoiceAgentSetup = {
  status: "draft" | "ready";
  serviceAreas: string[];
  transferNumber: string;
  lastSync: string;
  nextStep: string;
};

export const metrics: Metric[] = [
  {
    label: "Qualified response",
    value: "43s",
    note: "north-star metric",
    tone: "qualified",
  },
  {
    label: "New inbound",
    value: "42",
    note: "DMs, comments, calls, SMS",
    tone: "neutral",
  },
  {
    label: "Hot leads",
    value: "9",
    note: "needs human handoff",
    tone: "hot",
  },
  {
    label: "CRM sync",
    value: "96%",
    note: "Follow Up Boss health",
    tone: "syncing",
  },
];

export const leads: Lead[] = [
  {
    name: "Maya Chen",
    channel: "Instagram DM",
    channelIcon: AtSign,
    intent: "first-time buyer",
    status: "hot",
    score: 91,
    assignee: "Demi",
    sla: "2m left",
    summary:
      "Asked about new construction under 430k and says lender pre-approval is ready.",
  },
  {
    name: "Derrick James",
    channel: "Comment",
    channelIcon: MessageSquareText,
    intent: "seller lead",
    status: "qualified",
    score: 82,
    assignee: "Ari",
    sla: "assigned",
    summary:
      "Commented on a listing reel. Owns a home in Cypress and wants a valuation this week.",
  },
  {
    name: "Nia Brooks",
    channel: "Retell call",
    channelIcon: PhoneCall,
    intent: "buyer consult",
    status: "warm",
    score: 67,
    assignee: "Queue",
    sla: "nurture",
    summary:
      "Six-month timeline, not pre-approved yet, open to lender intro after school year.",
  },
  {
    name: "Marcus Hill",
    channel: "SMS",
    channelIcon: MessageSquareText,
    intent: "new build tour",
    status: "syncing",
    score: 74,
    assignee: "Jordan",
    sla: "FUB pending",
    summary:
      "Texted Homes keyword. Wants a Saturday tour and asked for builder incentives.",
  },
];

export const pipelineStages: PipelineStage[] = [
  { label: "Captured", count: 18, detail: "waiting on qualification" },
  { label: "Qualified", count: 12, detail: "score and intent confirmed" },
  { label: "Assigned", count: 9, detail: "agent accepted handoff" },
  { label: "Nurture", count: 21, detail: "AI follow-up running" },
];

export const integrations: Integration[] = [
  {
    name: "Instagram",
    status: "connected",
    state: "qualified",
    description: "DM and comment events ready for webhook delivery.",
  },
  {
    name: "Follow Up Boss",
    status: "needs key",
    state: "warm",
    description: "Workspace credential form and sync queue are next.",
  },
  {
    name: "Twilio",
    status: "planned",
    state: "syncing",
    description: "Numbers and SMS webhooks will route into the same lead model.",
  },
  {
    name: "Voice calls",
    status: "setup ready",
    state: "qualified",
    description: "Inbound calls can now be provisioned into workspace-owned agents.",
  },
];

export const voiceAgentSetup: VoiceAgentSetup = {
  status: "ready",
  serviceAreas: ["Houston", "Cypress", "Katy"],
  transferNumber: "+1 713 555 0100",
  lastSync: "not provisioned yet",
  nextStep: "create the workspace call agent, then run a live test call",
};

export const workflowSteps = [
  { label: "Capture", icon: AtSign },
  { label: "Qualify", icon: Bot },
  { label: "Assign", icon: BadgeCheck },
  { label: "Sync", icon: RotateCw },
  { label: "Follow up", icon: Clock3 },
] as const;
