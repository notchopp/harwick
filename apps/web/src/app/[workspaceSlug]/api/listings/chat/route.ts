import { createHash, randomBytes } from "node:crypto";

import { createOpenAI } from "@ai-sdk/openai";
import { UuidSchema } from "@realty-ops/core";
import { createOpenAISmallModelClient } from "@realty-ops/integrations";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse, type NextRequest } from "next/server";

import { createSmallModelGateJudge } from "../../../../../features/public-listings/listing-chat-gate-judge";
import { stripMarkdown } from "../../../../../features/public-listings/strip-markdown";
import { buildListingChatSystemPrompt } from "../../../../../features/public-listings/listing-chat-system-prompt";
import {
  buildListingChatTools,
  type ListingChatTurnState,
} from "../../../../../features/public-listings/listing-chat-tools";
import {
  loadPublicListingPortalState,
  PublicListingChatError,
  type PublicListingChatRepository,
  type PublicListingChatSession,
} from "../../../../../features/public-listings/public-listing-chat";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createSupabasePublicListingChatRepository } from "../../../../../lib/supabase/public-listing-chat";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";
export const maxDuration = 60;

const SESSION_COOKIE_NAME = "harwick_listing_session";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type ChatRequestBody = {
  messages: UIMessage[];
  id?: string;
};

function hashClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? null;
  if (ip === null || ip.length === 0) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function readTextFromMessage(message: UIMessage | undefined): string | null {
  if (message === undefined) return null;
  const text = message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
  return text.length > 0 ? text : null;
}

function summarizeToolExecutions(messages: UIMessage[]): Array<{
  tool: string;
  status: string;
  output?: unknown;
}> {
  return messages.flatMap((message) => message.parts.flatMap((part) => {
    if (!part.type.startsWith("tool-")) return [];
    const toolPart = part as { type: string; state?: string; output?: unknown };
    return [{
      tool: toolPart.type.replace(/^tool-/, ""),
      status: toolPart.state ?? "unknown",
      ...(toolPart.output === undefined ? {} : { output: toolPart.output }),
    }];
  }));
}

async function ensureSession(params: {
  repository: PublicListingChatRepository;
  workspaceId: string;
  listingId: string;
  cookieToken: string | null;
  ipHash: string | null;
  userAgent: string | null;
  createdAt: string;
}): Promise<{ session: PublicListingChatSession; created: boolean }> {
  if (params.cookieToken !== null) {
    const existing = await params.repository.findSessionByToken({
      sessionToken: params.cookieToken,
      workspaceId: params.workspaceId,
      listingId: params.listingId,
    });
    if (existing !== null) return { session: existing, created: false };
  }
  const sessionToken = params.cookieToken ?? randomBytes(24).toString("base64url");
  const created = await params.repository.createSession({
    workspaceId: params.workspaceId,
    listingId: params.listingId,
    sessionToken,
    ipHash: params.ipHash,
    userAgent: params.userAgent,
    createdAt: params.createdAt,
  });
  return { session: created, created: true };
}

/**
 * POST /[workspaceSlug]/api/listings/chat?listingId=...
 * AI SDK UIMessage-protocol streaming endpoint. Mirrors the operator
 * harwick-chat route: streamText + toUIMessageStreamResponse so the
 * client useChat hook gets tool calls + text as typed parts in real time.
 *
 * Trims everything off the old custom JSON contract — no statePatch
 * projection, no heuristic deriver, no synthesized log_listing_memory.
 * The model is the source of truth; tools update state inside their
 * execute callbacks and onFinish persists.
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ workspaceSlug: string }> },
) {
  const { workspaceSlug } = await props.params;
  const listingId = request.nextUrl.searchParams.get("listingId");
  if (listingId === null) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsedListingId = UuidSchema.safeParse(listingId);
  if (!parsedListingId.success) {
    return NextResponse.json({ error: "invalid_listing_id" }, { status: 400 });
  }

  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "public-listing-chat" }),
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  let body: ChatRequestBody | null;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (body === null || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let environment: ReturnType<typeof getServerEnvironment>;
  try {
    environment = getServerEnvironment();
  } catch {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }
  if (environment.OPENAI_API_KEY === undefined || environment.OPENAI_API_KEY.length === 0) {
    return NextResponse.json({ error: "openai_unavailable" }, { status: 503 });
  }

  const supabase = createServerSupabaseClient();
  const repository = createSupabasePublicListingChatRepository(supabase);
  const cookieToken = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const occurredAt = new Date().toISOString();

  // Load portal state ONCE — it carries everything the prompt + tools
  // need (workspace, listing, memory, team, prior qualification, assigned
  // agent, showings, isReturning).
  let portal: Awaited<ReturnType<typeof loadPublicListingPortalState>>;
  let workspaceId: string;
  let workspaceName: string;
  try {
    const workspace = await repository.findWorkspaceBySlug(workspaceSlug);
    if (workspace === null) throw new PublicListingChatError("workspace_not_found", 404);
    workspaceId = workspace.id;
    workspaceName = workspace.name;
    portal = await loadPublicListingPortalState({
      workspaceSlug,
      listingId: parsedListingId.data,
      sessionToken: cookieToken,
      repository,
    });
  } catch (error) {
    if (error instanceof PublicListingChatError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error("[public-listing-chat] portal load failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const listing = await repository.findListing({
    workspaceId,
    listingId: parsedListingId.data,
  });
  if (listing === null) {
    return NextResponse.json({ error: "listing_not_found" }, { status: 404 });
  }
  const memory = await repository.findListingMemory({
    workspaceId,
    listingId: parsedListingId.data,
  });

  // Ensure session exists BEFORE the stream starts so the cookie can be
  // set on the response (and onFinish persistence has a session_id).
  const { session, created: sessionCreated } = await ensureSession({
    repository,
    workspaceId,
    listingId: parsedListingId.data,
    cookieToken,
    ipHash: hashClientIp(request),
    userAgent: request.headers.get("user-agent"),
    createdAt: occurredAt,
  });

  // Persist the visitor turn upfront so even if streaming fails we have
  // the inbound recorded.
  const latestUserText = readTextFromMessage(body.messages[body.messages.length - 1]);
  if (latestUserText !== null) {
    try {
      await repository.appendTurn({
        sessionId: session.id,
        actor: "visitor",
        body: latestUserText,
        statePatch: null,
        nextAction: null,
        occurredAt,
      });
    } catch (error) {
      console.error("[public-listing-chat] visitor appendTurn failed", error);
    }
  }

  // Merge prior cross-listing qualification (name, area, budget the
  // visitor shared on OTHER listings via the same cookie) into the
  // current session's qualification before handing it to the model.
  // Without this, switching listings makes the model forget the
  // visitor's name and preferences every time.
  const visitorContext = await repository.findVisitorContext({
    workspaceId,
    sessionToken: session.sessionToken,
  }).catch(() => null);
  const mergedQualification = {
    ...(visitorContext?.priorQualification ?? {}),
    ...session.qualification,
  };

  const turnState: ListingChatTurnState = {
    qualificationDelta: {},
    capturedLead: null,
  };
  const openaiKey = process.env["OPENAI_API_KEY"];
  const gateJudge = typeof openaiKey === "string" && openaiKey.length > 0
    ? createSmallModelGateJudge({
        smallModel: createOpenAISmallModelClient({ apiKey: openaiKey, model: "gpt-4o-mini" }),
        timeoutMs: 1500,
        onFallback: (reason, details) => {
          console.warn(`[listing-chat] gate judge fell back (${reason})`, details);
        },
      })
    : undefined;

  const tools = buildListingChatTools({
    repository,
    workspaceId,
    workspaceName,
    listing,
    priorQualification: mergedQualification,
    team: portal.state.team,
    assignedAgent: portal.state.assignedAgent,
    // Tavily is the active backend; BRAVE_SEARCH_API_KEY is a legacy
    // fallback in case operators set Brave instead. Either powers the
    // same `lookup_area_info` tool — see `area-lookup.ts`.
    // Read via `environment` (not `process.env` directly) so the local-env
    // fallback walker in lib/local-env.ts finds the root .env.local in
    // monorepo dev. Otherwise TAVILY/BRAVE silently don't reach the dev
    // server because `next dev` runs from apps/web cwd where there's no
    // .env.local.
    searchApiKey: environment.TAVILY_API_KEY ?? environment.BRAVE_SEARCH_API_KEY,
    occurredAt,
    latestVisitorText: latestUserText ?? undefined,
    gateJudge,
    state: turnState,
  });

  const systemPrompt = buildListingChatSystemPrompt({
    workspaceName,
    listing,
    memory,
    team: portal.state.team,
    visitorQualification: mergedQualification,
    visitorAgent: portal.state.assignedAgent,
    visitorShowings: portal.state.showings,
    isReturningVisitor: portal.state.profile.isReturning,
    currentDate: new Date().toISOString().slice(0, 10),
  });

  const openai = createOpenAI({ apiKey: environment.OPENAI_API_KEY });
  const modelName = process.env["OPENAI_PUBLIC_LISTING_CHAT_MODEL"]
    ?? environment.OPENAI_REPLY_MODEL;

  const modelMessages = await convertToModelMessages(body.messages);
  const result = streamText({
    model: openai(modelName),
    system: systemPrompt,
    messages: modelMessages,
    tools,
    // 6 steps: enough to (a) note_qualification → (b) search → (c) surface
    // multiple cards → (d) final reply. Mirrors operator chat ceiling.
    stopWhen: stepCountIs(6),
    onError({ error }) {
      console.error("[public-listing-chat] streamText error", error);
    },
  });

  const response = result.toUIMessageStreamResponse({
    originalMessages: body.messages,
    async onFinish(event) {
      if (event.isAborted) return;
      // Strip markdown server-side too. The client also strips before render,
      // but persisting raw markdown leaves broken artifacts in logs/audits and
      // future replays. Single source of truth: strip-markdown.ts.
      const rawAssistantText = readTextFromMessage(event.responseMessage) ?? "";
      const assistantText = stripMarkdown(rawAssistantText);
      const finishOccurredAt = new Date().toISOString();

      // Persist the assistant turn with whatever real tool activity ran.
      try {
        const toolExecutions = summarizeToolExecutions(event.messages);
        await repository.appendTurn({
          sessionId: session.id,
          actor: "harwick_ai",
          body: assistantText,
          statePatch: Object.keys(turnState.qualificationDelta).length > 0
            ? turnState.qualificationDelta as Record<string, unknown>
            : null,
          nextAction: turnState.capturedLead === null ? null
            : turnState.capturedLead.intent === "showing" ? "request_showing_approval"
            : "handoff_to_agent",
          confidence: null,
          missingFields: [],
          safetyFlags: [],
          handoffBrief: null,
          documentUpdate: null,
          toolCalls: toolExecutions.map((t) => ({
            tool: t.tool,
            reason: "model_invoked",
            requiresApproval: false,
            payload: t.output === undefined ? null : t.output,
          })) as never,
          occurredAt: finishOccurredAt,
        });
      } catch (error) {
        console.error("[public-listing-chat] assistant appendTurn failed", error);
      }

      // Merge the model-emitted qualification delta into the session.
      // Array fields (knownFacts, lifeContext, preferredShowingTimes,
      // vibeNotes) are APPENDED + deduped — the model passes only the
      // NEW notes per turn. Scalar fields overwrite as normal.
      if (Object.keys(turnState.qualificationDelta).length > 0) {
        try {
          const merged = mergeQualificationAdditive(session.qualification, turnState.qualificationDelta);
          await repository.updateSessionQualification({
            sessionId: session.id,
            qualification: merged,
            lastActiveAt: finishOccurredAt,
          });
        } catch (error) {
          console.error("[public-listing-chat] updateSessionQualification failed", error);
        }
      }

      // Link the promoted lead if any tool captured one.
      if (turnState.capturedLead !== null) {
        try {
          await repository.linkSessionLead({
            sessionId: session.id,
            leadId: turnState.capturedLead.leadId,
            promotedAt: finishOccurredAt,
          });
          await repository.insertLeadEvent({
            workspaceId,
            leadId: turnState.capturedLead.leadId,
            listing,
            values: buildEventValues({ session, capturedLead: turnState.capturedLead }),
            providerEventId: buildProviderEventId({
              workspaceId,
              listingId: listing.id,
              leadId: turnState.capturedLead.leadId,
              occurredAt: finishOccurredAt,
            }),
            occurredAt: finishOccurredAt,
          });
        } catch (error) {
          console.error("[public-listing-chat] lead linkage failed", error);
        }
      }
    },
    onError(error) {
      return error instanceof Error ? error.message : "Harwick chat stream failed.";
    },
  });

  // Set / refresh the session cookie on the streaming response so the
  // next turn lands on the same server-side session. toUIMessageStreamResponse
  // returns a plain Response — wrap in a new Response so we can mutate
  // headers (Response.headers on the original is immutable).
  if (sessionCreated || cookieToken !== session.sessionToken) {
    const headers = new Headers(response.headers);
    const cookieAttrs = [
      `${SESSION_COOKIE_NAME}=${session.sessionToken}`,
      "Path=/",
      `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
      "HttpOnly",
      "SameSite=Lax",
    ];
    if (process.env.NODE_ENV === "production") cookieAttrs.push("Secure");
    headers.append("Set-Cookie", cookieAttrs.join("; "));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return response;
}

/**
 * Merge a qualification delta into an existing qualification with array
 * fields concatenated + deduplicated (not overwritten). The model emits
 * APPEND-ONLY array slots (knownFacts, lifeContext, vibeNotes,
 * preferredShowingTimes) — each turn passes only the NEW entries.
 */
const APPEND_ARRAY_FIELDS = [
  "knownFacts",
  "lifeContext",
  "preferredShowingTimes",
  "vibeNotes",
] as const;

function mergeQualificationAdditive(
  base: Record<string, unknown>,
  delta: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(delta)) {
    if (value === undefined) continue;
    if (APPEND_ARRAY_FIELDS.includes(key as typeof APPEND_ARRAY_FIELDS[number])) {
      const existing = Array.isArray(base[key]) ? (base[key] as unknown[]) : [];
      const incoming = Array.isArray(value) ? value : [];
      const seen = new Set<string>();
      const combined: string[] = [];
      for (const entry of [...existing, ...incoming]) {
        if (typeof entry !== "string") continue;
        const norm = entry.trim();
        if (norm.length === 0) continue;
        const dedupeKey = key === "knownFacts" ? normalizeKnownFact(norm) : normalizeMemoryLine(norm);
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        combined.push(norm);
      }
      next[key] = key === "knownFacts" ? removeFactsDuplicatedByLifeContext(combined, next) : combined;
    } else {
      next[key] = value;
    }
  }
  return next;
}

function normalizeMemoryLine(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKnownFact(value: string): string {
  return normalizeMemoryLine(value)
    .replace(/\b(visitor|buyer|client|they|their|is|are|has|have|and|with|looking|for|needs|need|wants|want|must)\b/g, " ")
    .replace(/\bchildren\b/g, "kids")
    .replace(/\bsons\b/g, "kids")
    .replace(/\bdaughters\b/g, "kids")
    .replace(/\s+/g, " ")
    .trim();
}

function removeFactsDuplicatedByLifeContext(
  knownFacts: string[],
  qualification: Record<string, unknown>,
): string[] {
  const lifeContext = Array.isArray(qualification["lifeContext"])
    ? qualification["lifeContext"].filter((entry): entry is string => typeof entry === "string")
    : [];
  if (lifeContext.length === 0) return knownFacts;
  const lifeKeys = lifeContext.map(normalizeKnownFact).filter((entry) => entry.length > 0);
  return knownFacts.filter((fact) => {
    const factKey = normalizeKnownFact(fact);
    return !lifeKeys.some((lifeKey) => {
      if (lifeKey.length < 3 || factKey.length < 3) return false;
      return factKey.includes(lifeKey) || lifeKey.includes(factKey);
    });
  });
}

function buildEventValues(params: {
  session: PublicListingChatSession;
  capturedLead: NonNullable<ListingChatTurnState["capturedLead"]>;
}) {
  const q = params.session.qualification;
  return {
    fullName: q.name ?? null,
    email: q.email ?? null,
    phone: q.phone ?? "",
    message: `Promoted via Harwick chat (${params.capturedLead.intent}).`,
    intent: params.capturedLead.intent,
    leadType: q.leadType ?? "buyer",
    leadIntent: q.intent ?? "medium",
    timeline: q.timeline ?? null,
    budget: null,
    targetArea: q.targetArea ?? null,
    propertyType: q.propertyType ?? null,
    financingStatus: q.financingStatus ?? "unknown",
    score: params.capturedLead.intent === "showing" ? 75 : 60,
    documentUpdate: "Promoted via public listing chat.",
  } as never;
}

function buildProviderEventId(params: {
  workspaceId: string;
  listingId: string;
  leadId: string;
  occurredAt: string;
}): string {
  return ["public_listing_chat", params.workspaceId, params.listingId, params.leadId, Date.parse(params.occurredAt)].join(":");
}

/**
 * GET /[workspaceSlug]/api/listings/chat?listingId=...
 * Buyer-portal state for the cookie holder on this listing.
 */
export async function GET(
  request: NextRequest,
  props: { params: Promise<{ workspaceSlug: string }> },
) {
  const { workspaceSlug } = await props.params;
  const listingId = request.nextUrl.searchParams.get("listingId");
  if (listingId === null || listingId.length === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "public-listing-portal" }),
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const result = await loadPublicListingPortalState({
      workspaceSlug,
      listingId,
      sessionToken: request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null,
      repository: createSupabasePublicListingChatRepository(createServerSupabaseClient()),
    });
    return NextResponse.json(result.state, { status: 200 });
  } catch (error) {
    if (error instanceof PublicListingChatError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    console.error("[public-listing-chat] portal GET failed", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
