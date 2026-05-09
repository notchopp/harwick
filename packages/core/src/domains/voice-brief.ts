import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";
import { LeadStatusSchema } from "./lead.js";

export const VoiceDailyBriefHighlightSchema = z.object({
  leadId: UuidSchema.nullable(),
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().min(1).max(320),
});

export const VoiceDailyBriefSummarySchema = z.object({
  activeConversationsLastHour: z.number().int().min(0),
  unassignedPriorityLeads: z.number().int().min(0),
  nurtureLeads: z.number().int().min(0),
  pendingVoiceHandoffs: z.number().int().min(0),
  openShowingTasks: z.number().int().min(0),
});

export const VoiceDailyBriefResponseSchema = z.object({
  workspaceId: UuidSchema,
  generatedAt: IsoDateTimeSchema,
  spokenText: z.string().trim().min(1).max(4000),
  summary: VoiceDailyBriefSummarySchema,
  highlights: z.array(VoiceDailyBriefHighlightSchema).max(5).default([]),
});

export const VoiceShowingBriefQuerySchema = z.object({
  leadId: UuidSchema,
  taskId: UuidSchema.optional(),
});

export const VoiceShowingBriefSnapshotSchema = z.object({
  leadId: UuidSchema,
  leadName: z.string().trim().min(1).max(160),
  status: LeadStatusSchema,
  listingAddress: z.string().trim().min(1).max(240).nullable(),
  showingWindowStart: IsoDateTimeSchema.nullable(),
  showingWindowEnd: IsoDateTimeSchema.nullable(),
  latestConversationSnippet: z.string().trim().min(1).max(500).nullable(),
  latestConversationAt: IsoDateTimeSchema.nullable(),
});

export const VoiceShowingBriefResponseSchema = z.object({
  workspaceId: UuidSchema,
  generatedAt: IsoDateTimeSchema,
  spokenText: z.string().trim().min(1).max(4000),
  snapshot: VoiceShowingBriefSnapshotSchema,
});

export const VoiceShowingDebriefOutcomeSchema = z.enum([
  "went_well",
  "needs_follow_up",
  "reschedule_needed",
  "not_interested",
  "unknown",
]);

export const VoiceShowingDebriefRequestSchema = z.object({
  leadId: UuidSchema,
  debrief: z.string().trim().min(1).max(4000),
  outcome: VoiceShowingDebriefOutcomeSchema.default("unknown"),
  statusOverride: LeadStatusSchema.optional(),
  notifyMemberId: UuidSchema.optional(),
  followUpTaskPriority: z.enum(["normal", "high", "urgent"]).default("high"),
  followUpDueAt: IsoDateTimeSchema.optional(),
});

export const VoiceShowingDebriefResponseSchema = z.object({
  workspaceId: UuidSchema,
  leadId: UuidSchema,
  generatedAt: IsoDateTimeSchema,
  outcome: VoiceShowingDebriefOutcomeSchema,
  statusUpdatedTo: LeadStatusSchema.nullable(),
  followUpTaskId: UuidSchema.nullable(),
  transcriptMessageId: UuidSchema.nullable(),
  spokenText: z.string().trim().min(1).max(4000),
});

export type VoiceDailyBriefHighlight = z.infer<typeof VoiceDailyBriefHighlightSchema>;
export type VoiceDailyBriefSummary = z.infer<typeof VoiceDailyBriefSummarySchema>;
export type VoiceDailyBriefResponse = z.infer<typeof VoiceDailyBriefResponseSchema>;
export type VoiceShowingBriefQuery = z.infer<typeof VoiceShowingBriefQuerySchema>;
export type VoiceShowingBriefSnapshot = z.infer<typeof VoiceShowingBriefSnapshotSchema>;
export type VoiceShowingBriefResponse = z.infer<typeof VoiceShowingBriefResponseSchema>;
export type VoiceShowingDebriefOutcome = z.infer<typeof VoiceShowingDebriefOutcomeSchema>;
export type VoiceShowingDebriefRequest = z.infer<typeof VoiceShowingDebriefRequestSchema>;
export type VoiceShowingDebriefResponse = z.infer<typeof VoiceShowingDebriefResponseSchema>;
