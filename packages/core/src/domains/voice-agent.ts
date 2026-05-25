import { z } from "zod";
import { IsoDateTimeSchema, ProviderIdSchema, UuidSchema } from "./common.js";
import { IntegrationAccountScopeSchema } from "./integration.js";
import { RealtyVoiceAliasesSchema } from "./voice-contract.js";

export const VoiceAgentProviderSchema = z.literal("retell");

export const VoiceAgentStatusSchema = z.enum([
  "draft",
  "provisioning",
  "active",
  "needs_sync",
  "error",
  "disabled",
]);

export const WorkspaceVoiceAgentSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  accountScope: IntegrationAccountScopeSchema,
  ownerMemberId: UuidSchema.nullable(),
  provider: VoiceAgentProviderSchema,
  status: VoiceAgentStatusSchema,
  retellAgentId: ProviderIdSchema.nullable(),
  retellConversationFlowId: ProviderIdSchema.nullable(),
  retellPhoneNumberId: ProviderIdSchema.nullable(),
  phoneNumber: z.string().trim().min(1).max(32).nullable(),
  serviceAreas: z.array(z.string().trim().min(1).max(120)),
  transferNumber: z.string().trim().min(1).max(32).nullable(),
  templateVersion: z.string().trim().min(1).max(80),
  publishedConfigHash: z.string().trim().min(1).max(128).nullable(),
  webhookUrl: z.string().trim().url().nullable(),
  dynamicVariablesWebhookUrl: z.string().trim().url().nullable(),
  lastSyncedAt: IsoDateTimeSchema.nullable(),
  lastErrorCode: z.string().trim().max(120).nullable(),
  lastErrorMessage: z.string().trim().max(1000).nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const WorkspaceVoiceAgentLookupResponseSchema = z.object({
  voiceAgent: WorkspaceVoiceAgentSchema.nullable(),
});

export const ProvisionWorkspaceVoiceAgentRequestSchema = z.object({
  accountScope: IntegrationAccountScopeSchema.default("workspace"),
  ownerMemberId: UuidSchema.nullable().default(null),
  serviceAreas: z.array(z.string().trim().min(1).max(120)).default([]),
  transferNumber: z.string().trim().min(1).max(32).nullable().default(null),
  templateFlowId: ProviderIdSchema.optional(),
  voiceId: ProviderIdSchema.optional(),
}).refine((value) => {
  return (value.accountScope === "workspace" && value.ownerMemberId === null)
    || (value.accountScope === "member" && value.ownerMemberId !== null);
}, {
  message: "Member-scoped voice agents require ownerMemberId; workspace-scoped voice agents cannot set ownerMemberId.",
});

export const ProvisionWorkspaceVoiceAgentResponseSchema = z.object({
  workspaceId: UuidSchema,
  voiceAgentId: UuidSchema,
  retellAgentId: ProviderIdSchema,
  retellConversationFlowId: ProviderIdSchema,
  phoneNumber: z.string().trim().min(1).max(32).nullable(),
  status: z.literal("active"),
  created: z.boolean(),
});

const RetellContextCallSchema = z.object({
  agent_id: ProviderIdSchema.optional(),
  call_id: ProviderIdSchema.optional(),
  from_number: z.string().trim().min(1).max(32).optional().nullable(),
  to_number: z.string().trim().min(1).max(32).optional().nullable(),
}).passthrough();

export const RetellCallContextRequestSchema = z.object({
  agent_id: ProviderIdSchema.optional(),
  call_id: ProviderIdSchema.optional(),
  from_number: z.string().trim().min(1).max(32).optional().nullable(),
  to_number: z.string().trim().min(1).max(32).optional().nullable(),
  call: RetellContextCallSchema.optional(),
}).passthrough().refine((value) => value.agent_id !== undefined || value.call?.agent_id !== undefined, {
  message: "Retell context request requires an agent_id.",
});

export const RetellCallContextResponseSchema = z.object({
  workspace_id: UuidSchema,
  workspace_name: z.string().trim().min(1).max(120),
  retell_agent_id: ProviderIdSchema,
  lead_id: z.union([UuidSchema, z.literal("")]),
  service_areas: z.string().trim().min(1),
  transfer_number: z.string(),
  caller_name: z.string(),
  lead_type: z.string(),
  target_area: z.string(),
  timeline: z.string(),
  budget: z.string(),
  financing_status: z.string(),
  from_number: z.string(),
  to_number: z.string(),
  memory_summary: z.string().trim().min(1),
  next_action: z.string().trim().min(1),
}).merge(RealtyVoiceAliasesSchema);

export type VoiceAgentProvider = z.infer<typeof VoiceAgentProviderSchema>;
export type VoiceAgentStatus = z.infer<typeof VoiceAgentStatusSchema>;
export type WorkspaceVoiceAgent = z.infer<typeof WorkspaceVoiceAgentSchema>;
export type WorkspaceVoiceAgentLookupResponse = z.infer<typeof WorkspaceVoiceAgentLookupResponseSchema>;
export type ProvisionWorkspaceVoiceAgentRequest = z.infer<typeof ProvisionWorkspaceVoiceAgentRequestSchema>;
export type ProvisionWorkspaceVoiceAgentResponse = z.infer<typeof ProvisionWorkspaceVoiceAgentResponseSchema>;
export type RetellCallContextRequest = z.infer<typeof RetellCallContextRequestSchema>;
export type RetellCallContextResponse = z.infer<typeof RetellCallContextResponseSchema>;
