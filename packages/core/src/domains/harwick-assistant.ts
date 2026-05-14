import { z } from "zod";
import { HarwickAiToolCallSchema } from "./harwick-ai-runtime.js";
import { UuidSchema } from "./common.js";

export const HarwickAssistantMentionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["lead", "person", "harwick"]),
});

export const HarwickAssistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  mentions: z.array(HarwickAssistantMentionSchema).max(12).default([]),
  activeLeadId: UuidSchema.nullable().optional().default(null),
  stream: z.boolean().optional().default(false),
  threadId: z.string().trim().min(1).max(120).optional(),
});

export const HarwickAssistantArtifactVersionSchema = z.object({
  label: z.string().trim().min(1).max(40),
  summary: z.string().trim().min(1).max(200),
});

export const HarwickAssistantArtifactSchema = z.object({
  body: z.string().trim().min(1).max(12000),
  title: z.string().trim().min(1).max(160),
  type: z.enum(["brief", "reply", "plan", "policy"]),
  version: z.string().trim().min(1).max(40).default("v1"),
  versions: z.array(HarwickAssistantArtifactVersionSchema).max(6).default([]),
});

export const HarwickAssistantFollowUpQuestionOptionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(120),
});

export const HarwickAssistantFollowUpQuestionSchema = z.object({
  helper: z.string().trim().min(1).max(240),
  options: z.array(HarwickAssistantFollowUpQuestionOptionSchema).min(2).max(6),
  question: z.string().trim().min(1).max(240),
});

export const HarwickAssistantReasoningStepSchema = z.object({
  detail: z.string().trim().min(1).max(320),
  label: z.string().trim().min(1).max(120),
});

// Response cards — Claude-style structured artifacts the rail renders below
// the prose answer. Each variant has its own shape so the UI can lay them out
// with proper card primitives instead of dumping text. Discriminated union on
// `kind` so adding variants is type-safe.

export const ResponseCardActionSchema = z.object({
  label: z.string().trim().min(1).max(40),
  href: z.string().trim().min(1).max(400).optional(),
  intent: z.enum(["primary", "ghost", "danger"]).default("ghost"),
});

const LeadListItemSchema = z.object({
  leadId: UuidSchema.nullable(),
  name: z.string().trim().min(1).max(160),
  source: z.enum(["instagram", "facebook", "voice", "operations", "follow_up_boss", "other"]).default("other"),
  status: z.string().trim().min(1).max(40),
  scoreLabel: z.string().trim().min(1).max(40).nullable().default(null),
  reason: z.string().trim().min(1).max(240),
  lastTouchLabel: z.string().trim().min(1).max(40).nullable().default(null),
  actions: z.array(ResponseCardActionSchema).max(3).default([]),
});

const CalendarSlotSchema = z.object({
  startIso: z.string().trim().min(1).max(40),
  endIso: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().min(1).max(240).nullable().default(null),
  tone: z.enum(["confirmed", "pending", "blocked"]).default("confirmed"),
});

const RoutingDecisionSchema = z.object({
  leadId: UuidSchema.nullable(),
  leadName: z.string().trim().min(1).max(160),
  fromMember: z.string().trim().min(1).max(120).nullable(),
  toMember: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(320),
  requiresApproval: z.boolean(),
});

const DraftReplySchema = z.object({
  leadId: UuidSchema.nullable(),
  leadName: z.string().trim().min(1).max(160),
  channel: z.string().trim().min(1).max(40),
  body: z.string().trim().min(1).max(1600),
  rationale: z.string().trim().min(1).max(320).nullable().default(null),
});

const TeamMemberSnapshotSchema = z.object({
  memberId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  role: z.string().trim().min(1).max(60),
  status: z.enum(["online", "away", "offline"]),
  openWork: z.number().int().nonnegative(),
  capacity: z.number().min(0).max(1).nullable().default(null),
});

const ApprovalRequestSchema = z.object({
  tool: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(320),
  payloadPreview: z.string().trim().min(1).max(400).nullable().default(null),
  riskNote: z.string().trim().min(1).max(240).nullable().default(null),
});

export const HarwickResponseCardSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("lead-list"),
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(280).nullable().default(null),
    items: z.array(LeadListItemSchema).min(1).max(12),
  }),
  z.object({
    kind: z.literal("calendar-day"),
    title: z.string().trim().min(1).max(120),
    dateLabel: z.string().trim().min(1).max(40),
    slots: z.array(CalendarSlotSchema).max(20),
    emptyMessage: z.string().trim().min(1).max(120).nullable().default(null),
  }),
  z.object({
    kind: z.literal("routing-decisions"),
    title: z.string().trim().min(1).max(120),
    items: z.array(RoutingDecisionSchema).min(1).max(8),
  }),
  z.object({
    kind: z.literal("draft-reply"),
    title: z.string().trim().min(1).max(120),
    draft: DraftReplySchema,
    actions: z.array(ResponseCardActionSchema).max(4).default([]),
  }),
  z.object({
    kind: z.literal("team-status"),
    title: z.string().trim().min(1).max(120),
    members: z.array(TeamMemberSnapshotSchema).min(1).max(20),
  }),
  z.object({
    kind: z.literal("approvals"),
    title: z.string().trim().min(1).max(120),
    items: z.array(ApprovalRequestSchema).min(1).max(8),
  }),
]);

export type HarwickResponseCard = z.infer<typeof HarwickResponseCardSchema>;

export const HarwickAssistantResponseSchema = z.object({
  answer: z.string().trim().min(1).max(4000),
  artifact: HarwickAssistantArtifactSchema.optional(),
  followUpQuestion: HarwickAssistantFollowUpQuestionSchema.nullable().default(null),
  reasoningSteps: z.array(HarwickAssistantReasoningStepSchema).min(1).max(5),
  scope: z.string().trim().min(1).max(200),
  toolCalls: z.array(HarwickAiToolCallSchema).max(8).default([]),
  responseCards: z.array(HarwickResponseCardSchema).max(6).default([]),
});

export const HarwickAssistantRuntimeInputSchema = z.object({
  workspaceName: z.string().trim().min(1).max(120),
  operatorName: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1).max(4000),
  mentions: z.array(HarwickAssistantMentionSchema).max(12).default([]),
  recentLeads: z.array(z.string().trim().min(1).max(600)).max(12).default([]),
  routing: z.array(z.string().trim().min(1).max(600)).max(12).default([]),
  team: z.array(z.string().trim().min(1).max(600)).max(20).default([]),
});

export type HarwickAssistantMention = z.infer<typeof HarwickAssistantMentionSchema>;
export type HarwickAssistantRequest = z.infer<typeof HarwickAssistantRequestSchema>;
export type HarwickAssistantArtifactVersion = z.infer<typeof HarwickAssistantArtifactVersionSchema>;
export type HarwickAssistantArtifact = z.infer<typeof HarwickAssistantArtifactSchema>;
export type HarwickAssistantFollowUpQuestion = z.infer<typeof HarwickAssistantFollowUpQuestionSchema>;
export type HarwickAssistantReasoningStep = z.infer<typeof HarwickAssistantReasoningStepSchema>;
export type HarwickAssistantResponse = z.infer<typeof HarwickAssistantResponseSchema>;
export type HarwickAssistantRuntimeInput = z.infer<typeof HarwickAssistantRuntimeInputSchema>;
