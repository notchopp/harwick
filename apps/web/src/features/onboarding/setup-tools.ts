import {
  CaptureReplyExamplesInputSchema,
  CompleteOnboardingBeatInputSchema,
  RegisterChannelIntentInputSchema,
  SetWorkspaceIdentityInputSchema,
  type WorkspaceOnboardingState,
} from "@realty-ops/core";
import { tool } from "ai";

import {
  markOnboardingBeatComplete,
  persistChannelIntents,
  persistReplyExamples,
  persistWorkspaceIdentity,
} from "../../lib/supabase/workspace-onboarding";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";

type OnboardingToolDeps = {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
};

function summarizeState(state: WorkspaceOnboardingState): {
  identityDone: boolean;
  replyExamplesDone: boolean;
  channelIntentDone: boolean;
  completed: boolean;
} {
  return {
    identityDone: state.identityDone,
    replyExamplesDone: state.replyExamplesDone,
    channelIntentDone: state.channelIntentDone,
    completed: state.completedAt !== null,
  };
}

export function buildOnboardingSetupTools(deps: OnboardingToolDeps) {
  return {
    set_workspace_identity: tool({
      description:
        "Save the operator's workspace identity (type, primary areas, tone). Call this once the operator has answered the identity questions. Marks the 'identity' beat complete and writes the answers to workspace memory so Harwick acts on them from the first real lead.",
      inputSchema: SetWorkspaceIdentityInputSchema,
      execute: async (input) => {
        await persistWorkspaceIdentity(deps.supabase, deps.workspaceId, input);
        const next = await markOnboardingBeatComplete(deps.supabase, deps.workspaceId, "identity");
        return {
          ok: true,
          beat: "identity",
          state: summarizeState(next),
        };
      },
    }),

    capture_reply_examples: tool({
      description:
        "Save 1-20 past message samples the operator pasted so Harwick can match their voice. Use this when the operator has shared real example replies. Marks the 'reply_examples' beat complete.",
      inputSchema: CaptureReplyExamplesInputSchema,
      execute: async (input) => {
        const saved = await persistReplyExamples(deps.supabase, deps.workspaceId, input);
        const next = await markOnboardingBeatComplete(deps.supabase, deps.workspaceId, "reply_examples");
        return {
          ok: true,
          beat: "reply_examples",
          savedCount: saved.length,
          state: summarizeState(next),
        };
      },
    }),

    register_channel_intent: tool({
      description:
        "Record which channels the operator plans to use and the automation mode they want per channel (suggest_only | approval_first | auto_send). Marks the 'channel_intent' beat complete.",
      inputSchema: RegisterChannelIntentInputSchema,
      execute: async (input) => {
        const saved = await persistChannelIntents(deps.supabase, deps.workspaceId, input);
        const next = await markOnboardingBeatComplete(deps.supabase, deps.workspaceId, "channel_intent");
        return {
          ok: true,
          beat: "channel_intent",
          savedCount: saved.length,
          state: summarizeState(next),
        };
      },
    }),

    complete_beat: tool({
      description:
        "Mark a specific onboarding beat as complete without saving any new data. Use only when the operator explicitly wants to skip a beat. Prefer the dedicated set_/capture_/register_ tools when the operator has answers to share.",
      inputSchema: CompleteOnboardingBeatInputSchema,
      execute: async ({ beat }) => {
        const next = await markOnboardingBeatComplete(deps.supabase, deps.workspaceId, beat);
        return { ok: true, beat, state: summarizeState(next) };
      },
    }),
  };
}
