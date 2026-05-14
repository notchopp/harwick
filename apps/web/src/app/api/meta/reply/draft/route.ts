import {
  buildPersistedHarwickAiToolCalls,
  deriveHarwickAiTurnPersistenceStatus,
  evaluateHarwickAiAutomation,
  HarwickAiAutomationPolicySchema,
  HarwickAiRuntimeInputSchema,
  UuidSchema,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import {
  createLocalHarwickAiRuntime,
  createOpenAIHarwickAiRuntime,
  toLegacyAiReplyDraft,
} from "@realty-ops/integrations";
import { createAiSdkHarwickAiRuntime } from "../../../../../features/lead-intake/ai-sdk-runtime";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../../lib/server-env";
import {
  hydrateMetaSocialPostContext,
  isSocialPostContextThin,
} from "../../../../../lib/meta-post-hydration";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";
import { createSupabaseMetaCredentialRepository } from "../../../../../lib/supabase/integration-accounts";
import { createSupabaseSocialPostRepository } from "../../../../../lib/supabase/social-posts";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import {
  createSupabaseHarwickAiAutomationPolicyRepository,
  createSupabaseHarwickAiTurnRepository,
} from "../../../../../lib/supabase/harwick-ai-turns";
import { createSupabaseSocialReplyQueueRepository } from "../../../../../lib/supabase/operator-queues";
import { createWorkflowJobEnqueuer } from "../../../../../lib/supabase/workflow-jobs";
import { buildHarwickAiReplyJobInput } from "../../../../../features/integrations/harwick-ai-reply-jobs";

export const runtime = "nodejs";

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "meta-reply-draft" }),
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const environment = getServerEnvironment();
  const isDevelopment = process.env["NODE_ENV"] === "development";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const record = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const mode = readString(record, "mode");
  const useLocalDrafts = mode === "local" || (isDevelopment && environment.OPENAI_API_KEY === undefined);

  if (!useLocalDrafts && environment.OPENAI_API_KEY === undefined) {
    return NextResponse.json({ error: "missing_openai_api_key" }, { status: 500 });
  }
  const openAiApiKey = environment.OPENAI_API_KEY;
  const leadText = readString(record, "leadText");
  const workspaceName = readString(record, "workspaceName") ?? "the team";
  const rawChannel = record["channel"];
  const channel = rawChannel === "instagram_comment" || rawChannel === "facebook_dm" || rawChannel === "facebook_comment"
    ? rawChannel
    : "instagram_dm";
  const leadContext = readString(record, "leadContext");
  const workspaceId = readString(record, "workspaceId");
  const leadId = readString(record, "leadId");
  const socialReplyReviewId = readString(record, "socialReplyReviewId");
  const providerThreadId = readString(record, "providerThreadId");
  const sourcePostId = readString(record, "sourcePostId");
  const providerAccountId = readString(record, "providerAccountId");
  const buyerBlueprintUrl = readString(record, "buyerBlueprintUrl");
  const listingContext = readString(record, "listingContext");

  if (leadText === null) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let membership: Awaited<ReturnType<typeof authorizeWorkspaceRequest>> = null;
  if (workspaceId !== null) {
    if (!UuidSchema.safeParse(workspaceId).success) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    membership = await authorizeWorkspaceRequest({ request, workspaceId });
    if (membership === null) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  let postContext = null;
  if (workspaceId !== null && sourcePostId !== null) {
    const supabase = createServerSupabaseClient();
    const socialPostRepository = createSupabaseSocialPostRepository(supabase);
    const integrationRepository = createSupabaseMetaCredentialRepository(supabase);

    postContext = await socialPostRepository.findPostContext({
      workspaceId,
      provider: "meta",
      sourcePostId,
    });

    if (
      environment.CREDENTIAL_ENCRYPTION_KEY !== undefined
      && (channel === "instagram_comment" || channel === "facebook_comment")
    ) {
      const hydratedContext = postContext !== null && isSocialPostContextThin({
        caption: postContext.caption,
        permalink: postContext.permalink,
        mediaType: postContext.media_type,
        ctaLabel: postContext.cta_label,
        areasMentioned: postContext.areas_mentioned,
        listingHints: postContext.listing_hints,
      })
        ? await hydrateMetaSocialPostContext({
            workspaceId,
            providerAccountId: postContext.provider_account_id,
            sourcePostId,
            sourceChannel: postContext.source_channel,
            credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
            integrationRepository,
          })
        : (
            postContext === null && providerAccountId !== null
              ? await hydrateMetaSocialPostContext({
                  workspaceId,
                  providerAccountId,
                  sourcePostId,
                  sourceChannel: channel,
                  credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
                  integrationRepository,
                })
              : null
          );

      if (hydratedContext !== null) {
        await socialPostRepository.upsertPostContexts([hydratedContext]);
        postContext = await socialPostRepository.findPostContext({
          workspaceId,
          provider: "meta",
          sourcePostId,
        });
      }
    }
  }

  // Two paths: legacy openai responses API + JSON parser (default), or the
  // ai-sdk path using generateObject with HarwickAiTurnSchema for guaranteed
  // structured output. Flip per workspace via HARWICK_LEAD_RUNTIME=ai-sdk.
  const useAiSdkRuntime = process.env["HARWICK_LEAD_RUNTIME"] === "ai-sdk";
  const aiRuntime = useLocalDrafts || openAiApiKey === undefined
    ? createLocalHarwickAiRuntime()
    : useAiSdkRuntime
      ? createAiSdkHarwickAiRuntime({ apiKey: openAiApiKey, model: environment.OPENAI_REPLY_MODEL })
      : createOpenAIHarwickAiRuntime({ apiKey: openAiApiKey, model: environment.OPENAI_REPLY_MODEL });
  const runtimeInput = HarwickAiRuntimeInputSchema.parse({
    workspaceName,
    channel,
    inboundText: leadText,
    conversation: [],
    state: {
      workspaceId,
      leadId: leadId !== null && UuidSchema.safeParse(leadId).success ? leadId : null,
      providerThreadId,
      channel,
      automationMode: "ai_on",
      currentIntent: "qualification_in_progress",
      qualification: {
        name: null,
        phone: null,
        email: null,
        leadType: "unknown",
        intent: "unknown",
        timeline: null,
        budget: null,
        targetArea: postContext?.areas_mentioned?.[0] ?? null,
        propertyType: null,
        financingStatus: "unknown",
        score: 0,
      },
      knownFacts: leadContext === null ? [] : [leadContext],
      lastAiAction: null,
      assignedAgentName: null,
      sourceOwnerName: null,
    },
    toneProfile: {
      name: `${workspaceName} default`,
      voice: "warm, concise, professional, and human",
      bannedPhrases: [],
      preferredPhrases: [],
      emojiPolicy: "none",
      signature: null,
    },
    postContext: postContext === null ? null : {
      caption: postContext.caption,
      ctaLabel: postContext.cta_label,
      areasMentioned: postContext.areas_mentioned,
      listingHints: postContext.listing_hints,
      permalink: postContext.permalink,
      visualDescription: (postContext as { visual_description?: string | null }).visual_description ?? null,
    },
    listingContext: listingContext === null ? null : {
      listingId: null,
      label: listingContext,
      address: null,
      price: null,
      status: null,
      beds: null,
      baths: null,
      area: postContext?.areas_mentioned?.[0] ?? null,
      facts: [listingContext],
      lastVerifiedAt: null,
    },
    calendarContext: [],
    buyerBlueprintUrl,
  });
  const aiTurn = await aiRuntime.runTurn(runtimeInput);
  const supabase = createServerSupabaseClient();
  const automationPolicy = workspaceId === null
    ? HarwickAiAutomationPolicySchema.parse({
        workspaceId: null,
        memberId: null,
        leadId: null,
        scope: "workspace",
        automationMode: runtimeInput.state?.automationMode ?? "ai_on",
      })
    : await createSupabaseHarwickAiAutomationPolicyRepository(supabase).resolveEffectivePolicy({
        workspaceId,
        memberId: membership?.memberId ?? null,
        leadId: runtimeInput.state?.leadId ?? null,
      });
  const automationDecision = evaluateHarwickAiAutomation({
    turn: aiTurn,
    policy: automationPolicy,
  });
  let persistedTurnId: string | null = null;
  let autoSendJobQueued = false;

  if (workspaceId !== null && membership !== null) {
    const { turnId } = await createSupabaseHarwickAiTurnRepository(supabase).insertTurn({
      workspaceId,
      leadId: runtimeInput.state?.leadId ?? null,
      socialReplyReviewId: socialReplyReviewId !== null && UuidSchema.safeParse(socialReplyReviewId).success
        ? socialReplyReviewId
        : null,
      providerThreadId,
      channel,
      runtimeInput,
      turn: aiTurn,
      automationPolicy,
      automationDecision,
      status: deriveHarwickAiTurnPersistenceStatus({ automationDecision }),
      toolCalls: buildPersistedHarwickAiToolCalls({
        toolCalls: aiTurn.toolCalls,
        approvedTools: automationDecision.approvedTools,
        blockedTools: automationDecision.blockedTools,
      }),
    });
    persistedTurnId = turnId;

    if (socialReplyReviewId !== null && UuidSchema.safeParse(socialReplyReviewId).success) {
      const review = await createSupabaseSocialReplyQueueRepository(supabase).findSocialReplyReview({
        workspaceId,
        reviewId: socialReplyReviewId,
      });
      if (review !== null) {
        const jobInput = buildHarwickAiReplyJobInput({
          turnId,
          review,
          automationDecision,
        });
        if (jobInput !== null) {
          await createWorkflowJobEnqueuer(supabase)(jobInput);
          autoSendJobQueued = true;
        }
      }
    }
  }
  const draft = toLegacyAiReplyDraft(aiTurn);

  if (
    workspaceId !== null
    && membership !== null
    && socialReplyReviewId !== null
    && UuidSchema.safeParse(socialReplyReviewId).success
  ) {
    await createSupabaseSocialReplyQueueRepository(supabase).updateSocialReplyReview({
      workspaceId,
      reviewId: socialReplyReviewId,
      values: {
        status: "pending",
        suggestedReply: draft.reply,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  }

  return NextResponse.json({
    ...draft,
    engine: useLocalDrafts ? "local" : "openai",
    runtime: "harwick_ai",
    status: "draft",
    aiTurn,
    automationDecision,
    automationPolicy,
    turnId: persistedTurnId,
    autoSendJobQueued,
    toolCalls: aiTurn.toolCalls,
    statePatch: aiTurn.statePatch,
    handoffBrief: aiTurn.handoffBrief,
  });
}
