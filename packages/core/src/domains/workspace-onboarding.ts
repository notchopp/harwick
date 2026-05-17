import { z } from "zod";
import { IsoDateTimeSchema, NonEmptyStringSchema, UuidSchema } from "./common.js";

/**
 * Workspace onboarding — the conversational setup at /onboarding/setup.
 *
 * Three beats in the MVP:
 *   1. identity — workspace name (already captured at plan-pick), workspace
 *      type, primary areas, and short tone description
 *   2. reply_examples — past message samples Harwick uses for voice matching
 *      on the first real lead
 *   3. channel_intent — which channels the operator plans to use and the
 *      default automation mode per channel
 *
 * Each beat is marked complete on its tool call; when all three are done the
 * server flips `completed_at` and the operator is routed to /home.
 */

export const WorkspaceOnboardingBeatSchema = z.enum([
  "identity",
  "reply_examples",
  "channel_intent",
]);

export const WorkspaceTypeSchema = z.enum([
  "solo",
  "team",
  "brokerage",
  "wholesaler",
  "property_manager",
  "developer",
  "other",
]);

export const SetWorkspaceIdentityInputSchema = z.object({
  workspaceType: WorkspaceTypeSchema,
  primaryAreas: z.array(NonEmptyStringSchema.max(120)).min(1).max(8),
  toneDescription: z.string().trim().min(8).max(500),
  workspaceDisplayName: z.string().trim().min(2).max(120).optional(),
});

export const ReplyExampleSourceSchema = z.enum([
  "onboarding_paste",
  "onboarding_screenshot",
  "onboarding_picked",
  "imported",
]);

export const CaptureReplyExamplesInputSchema = z.object({
  examples: z
    .array(
      z.object({
        body: z.string().trim().min(8).max(8000),
        source: ReplyExampleSourceSchema.default("onboarding_paste"),
      }),
    )
    .min(1)
    .max(20),
});

export const OnboardingChannelSchema = z.enum([
  "instagram",
  "facebook",
  "sms",
  "voice",
  "website",
]);

export const OnboardingChannelModeSchema = z.enum([
  "suggest_only",
  "approval_first",
  "auto_send",
]);

export const RegisterChannelIntentInputSchema = z.object({
  intents: z
    .array(
      z.object({
        channel: OnboardingChannelSchema,
        desiredMode: OnboardingChannelModeSchema,
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(5),
});

export const CompleteOnboardingBeatInputSchema = z.object({
  beat: WorkspaceOnboardingBeatSchema,
});

export const WorkspaceOnboardingStateSchema = z.object({
  workspaceId: UuidSchema,
  identityDone: z.boolean(),
  replyExamplesDone: z.boolean(),
  channelIntentDone: z.boolean(),
  completedAt: IsoDateTimeSchema.nullable(),
  updatedAt: IsoDateTimeSchema,
});

export const WorkspaceReplyExampleSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  body: z.string().min(8).max(8000),
  source: ReplyExampleSourceSchema,
  capturedAt: IsoDateTimeSchema,
});

export const WorkspaceChannelIntentSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  channel: OnboardingChannelSchema,
  desiredMode: OnboardingChannelModeSchema,
  notes: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});

export function isOnboardingComplete(state: WorkspaceOnboardingState): boolean {
  return state.identityDone && state.replyExamplesDone && state.channelIntentDone;
}

export type WorkspaceOnboardingBeat = z.infer<typeof WorkspaceOnboardingBeatSchema>;
export type WorkspaceType = z.infer<typeof WorkspaceTypeSchema>;
export type SetWorkspaceIdentityInput = z.infer<typeof SetWorkspaceIdentityInputSchema>;
export type CaptureReplyExamplesInput = z.infer<typeof CaptureReplyExamplesInputSchema>;
export type RegisterChannelIntentInput = z.infer<typeof RegisterChannelIntentInputSchema>;
export type CompleteOnboardingBeatInput = z.infer<typeof CompleteOnboardingBeatInputSchema>;
export type WorkspaceOnboardingState = z.infer<typeof WorkspaceOnboardingStateSchema>;
export type WorkspaceReplyExample = z.infer<typeof WorkspaceReplyExampleSchema>;
export type WorkspaceChannelIntent = z.infer<typeof WorkspaceChannelIntentSchema>;
export type OnboardingChannel = z.infer<typeof OnboardingChannelSchema>;
export type OnboardingChannelMode = z.infer<typeof OnboardingChannelModeSchema>;
