import { z } from "zod";
import { IsoDateTimeSchema, ProviderIdSchema, UuidSchema } from "./common.js";

export const IntegrationProviderSchema = z.enum(["meta", "twilio", "retell", "follow_up_boss", "repliers"]);

export const IntegrationAccountScopeSchema = z.enum(["workspace", "member"]);

export const IntegrationStatusSchema = z.enum([
  "pending",
  "connected",
  "needs_reauth",
  "disabled",
  "error",
]);

export const IntegrationAccountSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  accountScope: IntegrationAccountScopeSchema,
  ownerMemberId: UuidSchema.nullable(),
  provider: IntegrationProviderSchema,
  status: IntegrationStatusSchema,
  providerAccountId: ProviderIdSchema.nullable(),
  providerAccountName: z.string().trim().max(160).nullable(),
  encryptedCredentialRef: z.string().trim().min(1).nullable(),
  connectedAt: IsoDateTimeSchema.nullable(),
  lastHealthCheckAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const CrmSyncStatusSchema = z.enum(["queued", "synced", "failed", "skipped"]);

export const FollowUpBossWebhookEventTypeSchema = z.enum([
  "peopleUpdated",
  "peopleStageUpdated",
  "notesCreated",
  "tasksCreated",
  "textMessagesCreated",
  "callsCreated",
]);

export const FollowUpBossWebhookNotificationSchema = z.object({
  eventId: z.string().trim().min(1).max(160),
  eventCreated: IsoDateTimeSchema,
  event: FollowUpBossWebhookEventTypeSchema,
  resourceIds: z.array(z.number().int().nonnegative()).min(1),
  uri: z.string().trim().url().nullable(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const FollowUpBossWebhookSubscriptionStatusSchema = z.enum([
  "pending",
  "active",
  "error",
  "disabled",
]);

export const CrmBacksyncStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "failed",
  "ignored",
]);

export const FollowUpBossWebhookSubscriptionSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  integrationAccountId: UuidSchema,
  eventType: FollowUpBossWebhookEventTypeSchema,
  status: FollowUpBossWebhookSubscriptionStatusSchema,
  providerWebhookId: ProviderIdSchema.nullable(),
  callbackToken: z.string().trim().min(16).max(240),
  systemName: z.string().trim().min(1).max(160),
  encryptedSystemKeyRef: z.string().trim().min(1),
  lastRegisteredAt: IsoDateTimeSchema.nullable(),
  lastErrorCode: z.string().trim().max(120).nullable(),
  lastErrorMessage: z.string().trim().max(1000).nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const CrmBacksyncEventSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  provider: z.literal("follow_up_boss"),
  subscriptionId: UuidSchema,
  providerEventId: z.string().trim().min(1).max(160),
  eventType: FollowUpBossWebhookEventTypeSchema,
  resourceIds: z.array(z.number().int().nonnegative()),
  resourceUri: z.string().trim().url().nullable(),
  payload: FollowUpBossWebhookNotificationSchema,
  status: CrmBacksyncStatusSchema,
  correlatedSyncLogId: UuidSchema.nullable(),
  processedAt: IsoDateTimeSchema.nullable(),
  lastErrorCode: z.string().trim().max(120).nullable(),
  lastErrorMessage: z.string().trim().max(1000).nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const CrmSyncLogSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  leadId: UuidSchema,
  provider: z.literal("follow_up_boss"),
  status: CrmSyncStatusSchema,
  providerContactId: ProviderIdSchema.nullable(),
  attemptCount: z.number().int().min(0),
  lastErrorCode: z.string().trim().max(120).nullable(),
  lastErrorMessage: z.string().trim().max(1000).nullable(),
  nextRetryAt: IsoDateTimeSchema.nullable(),
  lastOutboundAt: IsoDateTimeSchema.nullable(),
  backsyncSuppressedUntil: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type IntegrationProvider = z.infer<typeof IntegrationProviderSchema>;
export type IntegrationAccountScope = z.infer<typeof IntegrationAccountScopeSchema>;
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;
export type IntegrationAccount = z.infer<typeof IntegrationAccountSchema>;
export type FollowUpBossWebhookEventType = z.infer<typeof FollowUpBossWebhookEventTypeSchema>;
export type FollowUpBossWebhookNotification = z.infer<typeof FollowUpBossWebhookNotificationSchema>;
export type FollowUpBossWebhookSubscriptionStatus = z.infer<typeof FollowUpBossWebhookSubscriptionStatusSchema>;
export type FollowUpBossWebhookSubscription = z.infer<typeof FollowUpBossWebhookSubscriptionSchema>;
export type CrmBacksyncStatus = z.infer<typeof CrmBacksyncStatusSchema>;
export type CrmBacksyncEvent = z.infer<typeof CrmBacksyncEventSchema>;
export type CrmSyncLog = z.infer<typeof CrmSyncLogSchema>;
