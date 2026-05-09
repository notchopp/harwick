import { z } from "zod";
import { HarwickAiToolCallSchema } from "./harwick-ai-runtime.js";

export const HarwickAssistantMentionSchema = z.object({
  id: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["lead", "person", "harwick"]),
});

export const HarwickAssistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  mentions: z.array(HarwickAssistantMentionSchema).max(12).default([]),
  stream: z.boolean().optional().default(false),
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

export const HarwickAssistantResponseSchema = z.object({
  answer: z.string().trim().min(1).max(4000),
  artifact: HarwickAssistantArtifactSchema.optional(),
  followUpQuestion: HarwickAssistantFollowUpQuestionSchema.nullable().default(null),
  reasoningSteps: z.array(HarwickAssistantReasoningStepSchema).min(1).max(5),
  scope: z.string().trim().min(1).max(200),
  toolCalls: z.array(HarwickAiToolCallSchema).max(8).default([]),
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
