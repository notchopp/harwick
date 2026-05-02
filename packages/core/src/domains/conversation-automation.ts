import { z } from "zod";

export const ConversationAutomationModeSchema = z.enum([
  "ai_on",
  "human_takeover",
  "paused_by_rule",
]);

export type ConversationAutomationMode = z.infer<typeof ConversationAutomationModeSchema>;

export const ConversationAutomationControlSchema = z.object({
  conversationId: z.string().uuid(),
  mode: ConversationAutomationModeSchema,
  reason: z.string().trim().min(1).max(240).nullable(),
  changedByMemberId: z.string().uuid().nullable(),
});

export type ConversationAutomationControl = z.infer<typeof ConversationAutomationControlSchema>;

export const ConversationAutomationScopeSchema = z.object({
  workspaceId: z.string().uuid(),
  leadId: z.string().uuid().nullable(),
  providerAccountId: z.string().trim().min(1),
  recipientUserId: z.string().trim().min(1).nullable(),
  channel: z.enum(["instagram_dm", "instagram_comment", "facebook_dm", "facebook_comment"]),
});

export type ConversationAutomationScope = z.infer<typeof ConversationAutomationScopeSchema>;

export const ConversationAutomationControlRequestSchema = z.object({
  mode: ConversationAutomationModeSchema,
  reason: z.string().trim().min(1).max(240).nullable().optional(),
});

export type ConversationAutomationControlRequest = z.infer<typeof ConversationAutomationControlRequestSchema>;

export function canAutomationSend(mode: ConversationAutomationMode): boolean {
  return mode === "ai_on";
}

export function automationModeLabel(mode: ConversationAutomationMode): string {
  if (mode === "ai_on") {
    return "ai on";
  }

  if (mode === "human_takeover") {
    return "human takeover";
  }

  return "paused by rule";
}

export function automationModeDescription(mode: ConversationAutomationMode): string {
  if (mode === "ai_on") {
    return "Harwick can send safe replies and keep qualifying from the current thread context.";
  }

  if (mode === "human_takeover") {
    return "Harwick will listen, summarize, and suggest next steps, but it will not send.";
  }

  return "Harwick paused sending because this conversation needs approval, context, or a human decision.";
}
