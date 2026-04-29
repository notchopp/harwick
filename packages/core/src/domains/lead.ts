import { z } from "zod";
import {
  EmailSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  PhoneNumberSchema,
  ProviderIdSchema,
  UuidSchema,
} from "./common.js";

export const LeadSourceChannelSchema = z.enum([
  "instagram_dm",
  "instagram_comment",
  "facebook_dm",
  "facebook_comment",
  "call",
  "sms",
  "manual",
  "csv_import",
]);

export const LeadTypeSchema = z.enum(["buyer", "seller", "renter", "investor", "unknown"]);

export const LeadStatusSchema = z.enum([
  "new",
  "engaged",
  "qualified",
  "hot",
  "assigned",
  "nurture",
  "appointment_booked",
  "active_client",
  "closed_won",
  "closed_lost",
  "archived",
]);

export const LeadIntentSchema = z.enum(["high", "medium", "low", "spam", "unknown"]);

export const FinancingStatusSchema = z.enum([
  "preapproved",
  "cash",
  "needs_lender",
  "unknown",
]);

export const ExtractedLeadFieldsSchema = z.object({
  callSummary: z.string().trim().min(1).max(1000).nullable(),
  leadSummary: z.string().trim().min(1).max(1000).nullable(),
  leadType: LeadTypeSchema,
  intent: LeadIntentSchema,
  targetArea: z.string().trim().min(1).max(180).nullable(),
  timeline: z.string().trim().min(1).max(120).nullable(),
  budget: z.string().trim().min(1).max(120).nullable(),
  financingStatus: FinancingStatusSchema,
  callOutcome: z.string().trim().min(1).max(120).nullable(),
  callerName: z.string().trim().min(1).max(160).nullable(),
});

export const LeadScoreSchema = z.number().int().min(0).max(100);

export const LeadSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  status: LeadStatusSchema,
  sourceChannel: LeadSourceChannelSchema,
  sourceProviderId: ProviderIdSchema.nullable(),
  sourcePostId: ProviderIdSchema.nullable(),
  sourceCommentId: ProviderIdSchema.nullable(),
  instagramUserId: ProviderIdSchema.nullable(),
  instagramUsername: z.string().trim().min(1).max(80).nullable(),
  fullName: z.string().trim().min(1).max(160).nullable(),
  phone: PhoneNumberSchema.nullable(),
  email: EmailSchema.nullable(),
  leadType: LeadTypeSchema,
  intent: LeadIntentSchema,
  timeline: z.string().trim().max(120).nullable(),
  budgetMin: z.number().int().nonnegative().nullable(),
  budgetMax: z.number().int().nonnegative().nullable(),
  targetArea: z.string().trim().max(180).nullable(),
  financingStatus: FinancingStatusSchema,
  score: LeadScoreSchema,
  assignedAgentId: UuidSchema.nullable(),
  followUpBossContactId: ProviderIdSchema.nullable(),
  lastMessageAt: IsoDateTimeSchema.nullable(),
  nextFollowUpAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const CreateLeadInputSchema = LeadSchema.omit({
  id: true,
  score: true,
  status: true,
  assignedAgentId: true,
  followUpBossContactId: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: LeadStatusSchema.default("new"),
  score: LeadScoreSchema.default(0),
  assignedAgentId: UuidSchema.nullable().default(null),
  followUpBossContactId: ProviderIdSchema.nullable().default(null),
});

export const LeadEventTypeSchema = z.enum([
  "message_received",
  "comment_received",
  "call_completed",
  "sms_received",
  "reply_sent",
  "lead_scored",
  "lead_assigned",
  "crm_synced",
  "nurture_enrolled",
]);

export const NormalizedLeadEventSchema = z.object({
  workspaceId: UuidSchema,
  provider: z.enum(["meta", "twilio", "retell", "follow_up_boss", "manual"]),
  eventType: LeadEventTypeSchema,
  sourceChannel: LeadSourceChannelSchema,
  providerEventId: ProviderIdSchema,
  providerAccountId: ProviderIdSchema.nullable(),
  providerUserId: ProviderIdSchema.nullable(),
  sourcePostId: ProviderIdSchema.nullable(),
  sourceCommentId: ProviderIdSchema.nullable(),
  instagramUsername: z.string().trim().min(1).max(80).nullable(),
  phone: PhoneNumberSchema.nullable(),
  text: NonEmptyStringSchema.max(8000).nullable(),
  occurredAt: IsoDateTimeSchema,
  rawPayload: z.unknown(),
});

export type LeadSourceChannel = z.infer<typeof LeadSourceChannelSchema>;
export type LeadType = z.infer<typeof LeadTypeSchema>;
export type LeadStatus = z.infer<typeof LeadStatusSchema>;
export type LeadIntent = z.infer<typeof LeadIntentSchema>;
export type FinancingStatus = z.infer<typeof FinancingStatusSchema>;
export type ExtractedLeadFields = z.infer<typeof ExtractedLeadFieldsSchema>;
export type Lead = z.infer<typeof LeadSchema>;
export type CreateLeadInput = z.infer<typeof CreateLeadInputSchema>;
export type NormalizedLeadEvent = z.infer<typeof NormalizedLeadEventSchema>;
