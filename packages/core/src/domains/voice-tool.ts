import { z } from "zod";
import { ProviderIdSchema } from "./common.js";
import { RealtyVoiceLeadTypeSchema, RealtyVoiceUrgencySchema } from "./voice-contract.js";

export const RealtyVoiceToolNameSchema = z.enum([
  "create_lead_handoff",
  "lookup_listing",
  "transfer_call",
  "end_call",
]);

export const RealtyVoiceToolRequestSchema = z.object({
  call_id: ProviderIdSchema.optional(),
  agent_id: ProviderIdSchema.optional(),
  name: RealtyVoiceToolNameSchema.optional(),
  tool_name: RealtyVoiceToolNameSchema.optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  arguments: z.record(z.string(), z.unknown()).optional(),
  call: z.object({
    call_id: ProviderIdSchema.optional(),
    agent_id: ProviderIdSchema.optional(),
    retell_llm_dynamic_variables: z.record(z.string(), z.unknown()).optional(),
  }).passthrough().optional(),
  retell_llm_dynamic_variables: z.record(z.string(), z.unknown()).optional(),
}).passthrough().refine((value) => value.name !== undefined || value.tool_name !== undefined, {
  message: "Tool request requires a name.",
});

export const CreateLeadHandoffArgsSchema = z.object({
  caller_name: z.string().trim().min(1).max(120).optional(),
  phone_number: z.string().trim().min(1).max(32).optional(),
  lead_type: RealtyVoiceLeadTypeSchema.default("unknown"),
  target_area: z.string().trim().max(160).default(""),
  timeline: z.string().trim().max(160).default(""),
  budget: z.string().trim().max(160).default(""),
  financing_status: z.enum(["preapproved", "cash", "needs_lender", "unknown"]).default("unknown"),
  urgency: RealtyVoiceUrgencySchema.default("routine"),
  summary: z.string().trim().min(1).max(1000),
});

export const LookupListingArgsSchema = z.object({
  query: z.string().trim().min(1).max(240),
  mls_number: z.string().trim().min(1).max(80).optional(),
  address: z.string().trim().min(1).max(240).optional(),
  question: z.string().trim().min(1).max(500).optional(),
});

export const TransferCallArgsSchema = z.object({
  transfer_to: z.string().trim().min(1).max(80).optional(),
  reason: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(1).max(1000).optional(),
});

export const EndCallArgsSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const RealtyVoiceToolResponseSchema = z.object({
  result: z.string().trim().min(1),
  lead_id: z.string().uuid().optional(),
  handoff_id: z.string().uuid().optional(),
  transfer_number: z.string().trim().min(1).max(32).optional(),
  handoff_summary: z.string().trim().min(1).max(1000).optional(),
  transfer_target: z.string().trim().min(1).max(80).optional(),
  end_call: z.boolean().optional(),
});

export type RealtyVoiceToolName = z.infer<typeof RealtyVoiceToolNameSchema>;
export type RealtyVoiceToolRequest = z.infer<typeof RealtyVoiceToolRequestSchema>;
export type CreateLeadHandoffArgs = z.infer<typeof CreateLeadHandoffArgsSchema>;
export type RealtyVoiceToolResponse = z.infer<typeof RealtyVoiceToolResponseSchema>;
