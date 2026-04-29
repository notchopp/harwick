import { z } from "zod";
import { IsoDateTimeSchema, ProviderIdSchema, UuidSchema } from "./common.js";
import { IntegrationAccountScopeSchema } from "./integration.js";

export const StartMetaOAuthRequestSchema = z.object({
  workspaceId: UuidSchema,
  accountScope: IntegrationAccountScopeSchema.default("workspace"),
  ownerMemberId: UuidSchema.nullable().default(null),
}).refine((value) => {
  return (value.accountScope === "workspace" && value.ownerMemberId === null)
    || (value.accountScope === "member" && value.ownerMemberId !== null);
}, {
  message: "Member-scoped Meta OAuth requires ownerMemberId.",
});

export const MetaOAuthCallbackQuerySchema = z.object({
  state: z.string().trim().min(1).max(512),
  code: z.string().trim().min(1).max(4096),
});

export const MetaOAuthPendingSelectionQuerySchema = z.object({
  state: z.string().trim().min(1).max(512),
});

export const MetaOAuthSelectableAccountSchema = z.object({
  pageId: ProviderIdSchema,
  pageName: z.string().trim().min(1).max(160),
  instagramBusinessAccountId: ProviderIdSchema,
  instagramUsername: z.string().trim().min(1).max(160).nullable(),
});

export const MetaOAuthCredentialAccountSchema = MetaOAuthSelectableAccountSchema.extend({
  pageAccessToken: z.string().trim().min(1),
});

export const MetaConnectedCredentialSchema = z.object({
  userAccessToken: z.string().trim().min(1),
  pageAccessToken: z.string().trim().min(1),
  pageId: ProviderIdSchema,
  instagramBusinessAccountId: ProviderIdSchema,
});

export const MetaOAuthPendingSelectionPayloadSchema = z.object({
  version: z.literal("meta_oauth_selection_v1"),
  issuedAt: IsoDateTimeSchema,
  userAccessToken: z.string().trim().min(1),
  accounts: z.array(MetaOAuthCredentialAccountSchema).min(1).max(50),
});

export const CompleteMetaOAuthSelectionRequestSchema = z.object({
  state: z.string().trim().min(1).max(512),
  instagramBusinessAccountId: ProviderIdSchema,
});

export const MetaOAuthPendingSelectionResponseSchema = z.object({
  state: z.string().trim().min(1).max(512),
  accounts: z.array(MetaOAuthSelectableAccountSchema).min(1),
});

export type StartMetaOAuthRequest = z.infer<typeof StartMetaOAuthRequestSchema>;
export type MetaOAuthCallbackQuery = z.infer<typeof MetaOAuthCallbackQuerySchema>;
export type MetaOAuthPendingSelectionQuery = z.infer<typeof MetaOAuthPendingSelectionQuerySchema>;
export type MetaOAuthSelectableAccount = z.infer<typeof MetaOAuthSelectableAccountSchema>;
export type MetaOAuthCredentialAccount = z.infer<typeof MetaOAuthCredentialAccountSchema>;
export type MetaConnectedCredential = z.infer<typeof MetaConnectedCredentialSchema>;
export type MetaOAuthPendingSelectionPayload = z.infer<typeof MetaOAuthPendingSelectionPayloadSchema>;
export type CompleteMetaOAuthSelectionRequest = z.infer<typeof CompleteMetaOAuthSelectionRequestSchema>;
export type MetaOAuthPendingSelectionResponse = z.infer<typeof MetaOAuthPendingSelectionResponseSchema>;
