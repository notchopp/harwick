import {
  HarwickAiRuntimeInputSchema,
  UuidSchema,
} from "@realty-ops/core";
import { createLocalHarwickAiRuntime, toLegacyAiReplyDraft } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createHarwickAiRuntime } from "../../../../../../../features/lead-intake/ai-sdk-runtime";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../../../../lib/server-env";

export const runtime = "nodejs";
export const maxDuration = 60;

const DraftPreviewRequestSchema = z.object({
  examples: z.array(z.string().trim().min(8).max(8000)).min(1).max(8),
  toneDescription: z.string().trim().max(500).default(""),
  leadText: z.string().trim().min(1).max(800).default(
    "Hey saw the Bethesda listing - would FHA work here? still figuring out financing tbh",
  ),
});

const ALLOWED_ROLES = new Set(["owner", "admin", "team_lead", "lead_manager"] as const);

function inferEmojiPolicy(input: string): "none" | "minimal" | "natural" {
  const text = input.toLowerCase();
  if (text.includes("no emoji") || text.includes("without emoji") || text.includes("no emojis")) return "none";
  if (text.includes("emoji") || /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(input)) return "natural";
  return "minimal";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "onboarding-reply-draft-preview" }),
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const { workspaceId: rawWorkspaceId } = await context.params;
  const parsedWorkspaceId = UuidSchema.safeParse(rawWorkspaceId);
  if (!parsedWorkspaceId.success) {
    return NextResponse.json({ error: "invalid_workspace" }, { status: 400 });
  }
  const workspaceId = parsedWorkspaceId.data;

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: ALLOWED_ROLES,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = DraftPreviewRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request", issues: parsedBody.error.issues }, { status: 400 });
  }

  let environment: ReturnType<typeof getServerEnvironment>;
  try {
    environment = getServerEnvironment();
  } catch {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }
  const isDevelopment = process.env["NODE_ENV"] === "development";
  const useLocalDrafts = isDevelopment && environment.OPENAI_API_KEY === undefined;
  if (!useLocalDrafts && environment.OPENAI_API_KEY === undefined) {
    return NextResponse.json({ error: "openai_unavailable" }, { status: 503 });
  }

  const runtimeClient = useLocalDrafts || environment.OPENAI_API_KEY === undefined
    ? createLocalHarwickAiRuntime()
    : createHarwickAiRuntime({
        apiKey: environment.OPENAI_API_KEY,
        model: environment.OPENAI_REPLY_MODEL,
      });

  const examples = parsedBody.data.examples;
  const toneDescription = parsedBody.data.toneDescription;
  const runtimeInput = HarwickAiRuntimeInputSchema.parse({
    workspaceName: membership.workspaceName,
    channel: "instagram_dm",
    inboundText: parsedBody.data.leadText,
    conversation: examples.map((body, index) => ({
      id: `onboarding-example-${index + 1}`,
      actor: "human",
      body,
      occurredAt: null,
    })),
    state: {
      workspaceId,
      leadId: null,
      providerThreadId: "onboarding-preview",
      channel: "instagram_dm",
      automationMode: "ai_on",
      currentIntent: "qualification_in_progress",
      qualification: {
        name: "Marcus Webb",
        phone: null,
        email: null,
        leadType: "buyer",
        intent: "medium",
        timeline: null,
        budget: null,
        targetArea: null,
        propertyType: null,
        financingStatus: "unknown",
        score: 0,
      },
      knownFacts: ["onboarding preview", "lead is asking about FHA financing"],
      lastAiAction: null,
      assignedAgentName: null,
      sourceOwnerName: membership.displayName,
    },
    toneProfile: {
      name: `${membership.workspaceName} onboarding voice`,
      voice: toneDescription.length > 0
        ? toneDescription
        : "Match the operator's saved examples: warm, concise, direct, never pushy.",
      bannedPhrases: [],
      preferredPhrases: examples.slice(0, 4),
      emojiPolicy: inferEmojiPolicy(`${toneDescription}\n${examples.join("\n")}`),
      signature: null,
    },
    postContext: null,
    listingContext: {
      listingId: "onboarding-sample",
      label: "Bethesda listing",
      address: null,
      price: null,
      status: null,
      beds: null,
      baths: null,
      area: null,
      facts: ["sample onboarding listing context only; do not claim exact availability"],
      lastVerifiedAt: null,
    },
    calendarContext: [],
    buyerBlueprintUrl: null,
    policyNarrative:
      "This is an onboarding preview. Draft one safe real-estate reply in the operator's voice. Do not queue or execute tools. Do not claim lending, legal, contract, price, or availability certainty.",
    workspaceMemory: [
      "Operator reply examples captured during onboarding:",
      ...examples.map((example, index) => `${index + 1}. ${example}`),
    ].join("\n"),
    leadDocument: "Onboarding preview lead. Marcus asked if FHA would work and says financing is not settled yet.",
    retrievedExamples: null,
    operatorContext: null,
  });

  const turn = await runtimeClient.runTurn(runtimeInput);
  const draft = toLegacyAiReplyDraft(turn);

  return NextResponse.json({
    reply: draft.reply,
    engine: useLocalDrafts ? "local" : "openai",
    runtime: "harwick_ai",
  });
}
