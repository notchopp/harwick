import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../../../../lib/server-env";
import { checkPlanCapacity, recordBillingUsageEvent } from "../../../../../../../lib/supabase/billing";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Extract message text from an uploaded screenshot or text/PDF dump so the
 * operator doesn't have to retype every past reply by hand.
 *
 *  image/*      → OpenAI gpt-4o-mini vision parses the conversation, returns
 *                 only the operator-sent messages. HEIC iPhone photos are
 *                 transcoded to JPEG via sharp before the model call.
 *  application/pdf → first-pass text extraction (server-side, no model)
 *  text/plain   → split on blank lines
 *
 * Returns `{ messages: string[] }` — the client wires each entry into a new
 * reply-example textarea so the operator can sanity-check before saving.
 *
 * Rate-limited at 30 requests per hour per workspace IP. Every successful
 * vision extraction debits one social_turn from the workspace wallet so
 * operators can't grind through their plan budget with screenshot uploads.
 */

const ALLOWED_ROLES = new Set(["owner", "admin", "team_lead", "lead_manager"] as const);
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB hard cap on a single upload
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const OPENAI_TIMEOUT_MS = 20_000;
const EXTRACT_RATE_LIMIT_PER_HOUR = 30;
const EXTRACT_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId: rawWorkspaceId } = await context.params;
  const parsedWorkspaceId = UuidSchema.safeParse(rawWorkspaceId);
  if (!parsedWorkspaceId.success) {
    return NextResponse.json({ error: "invalid_workspace" }, { status: 400 });
  }
  const workspaceId = parsedWorkspaceId.data;

  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: `onboarding-reply-extract:${workspaceId}` }),
    limit: EXTRACT_RATE_LIMIT_PER_HOUR,
    windowMs: EXTRACT_RATE_LIMIT_WINDOW_MS,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: ALLOWED_ROLES,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let environment: ReturnType<typeof getServerEnvironment>;
  try {
    environment = getServerEnvironment();
  } catch {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large", limit: MAX_BYTES }, { status: 413 });
  }

  const rawMimeType = file.type.toLowerCase();
  const filename = (file.name ?? "").toLowerCase();
  const mimeType = resolveMimeType(rawMimeType, filename);

  try {
    if (ALLOWED_IMAGE_TYPES.has(mimeType) || HEIC_MIME_TYPES.has(mimeType)) {
      if (environment.OPENAI_API_KEY === undefined) {
        return NextResponse.json({ error: "vision_unavailable" }, { status: 503 });
      }
      const messages = await extractFromImage({
        file,
        mimeType,
        apiKey: environment.OPENAI_API_KEY,
      });

      // Meter the spend AFTER a successful extraction so failed model calls
      // don't burn the wallet. We charge one social_turn — vision is the same
      // bucket as a single AI turn for billing purposes today.
      void debitVisionCredit({ workspaceId }).catch((error) => {
        console.error("[extract] wallet debit failed", error);
      });

      return NextResponse.json({ messages });
    }

    if (mimeType === "text/plain") {
      const text = await file.text();
      return NextResponse.json({ messages: splitTextIntoMessages(text) });
    }

    if (mimeType === "application/pdf") {
      return NextResponse.json(
        { error: "pdf_not_yet_supported", message: "PDF extraction is coming soon. Paste the text for now." },
        { status: 415 },
      );
    }

    return NextResponse.json(
      { error: "unsupported_type", mimeType },
      { status: 415 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "extract_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * Resolve the effective MIME type. iPhones often upload HEIC files with an
 * empty / generic content-type header; fall back to the extension so we
 * still know to transcode.
 */
export function resolveMimeType(declaredMimeType: string, filename: string): string {
  if (declaredMimeType.length > 0) {
    return declaredMimeType;
  }
  if (filename.endsWith(".heic") || filename.endsWith(".heif")) {
    return "image/heic";
  }
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (filename.endsWith(".png")) {
    return "image/png";
  }
  if (filename.endsWith(".webp")) {
    return "image/webp";
  }
  if (filename.endsWith(".gif")) {
    return "image/gif";
  }
  return declaredMimeType;
}

export function isHeicMimeType(mimeType: string): boolean {
  return HEIC_MIME_TYPES.has(mimeType);
}

/**
 * Convert a HEIC buffer to a JPEG buffer using sharp. Sharp is dynamic-
 * imported so the bundler doesn't try to pull the native binary into the
 * Edge runtime — this route only runs on Node.
 */
export async function transcodeHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  const sharpModule = await import("sharp");
  const sharp = sharpModule.default;
  return sharp(buffer).jpeg({ quality: 90 }).toBuffer();
}

async function extractFromImage(params: {
  file: File;
  mimeType: string;
  apiKey: string;
}): Promise<string[]> {
  const bytes = Buffer.from(await params.file.arrayBuffer());

  // iPhone screenshots arrive as HEIC; OpenAI's vision endpoint doesn't
  // accept HEIC, so we transcode to JPEG locally first.
  const isHeic = isHeicMimeType(params.mimeType);
  const finalBytes = isHeic ? await transcodeHeicToJpeg(bytes) : bytes;
  const finalMimeType = isHeic ? "image/jpeg" : params.mimeType;

  const base64 = finalBytes.toString("base64");
  const dataUri = `data:${finalMimeType};base64,${base64}`;

  const requestBody = buildVisionRequestBody(dataUri);
  const content = await callVisionWithRetry({
    apiKey: params.apiKey,
    requestBody,
    timeoutMs: OPENAI_TIMEOUT_MS,
  });
  return parseVisionMessages(content);
}

export function buildVisionRequestBody(dataUri: string): Record<string, unknown> {
  const systemPrompt = [
    "You are parsing a screenshot of a real-estate agent's messaging conversation with a lead (Instagram DM, SMS, FB Messenger, WhatsApp, etc.).",
    "Identify which messages were sent BY THE AGENT (typically right-aligned, often the one asking qualification questions, scheduling tours, or sending follow-ups).",
    "Skip messages from the lead. Skip system/timestamp lines, read receipts, typing indicators.",
    "Return strict JSON in this shape: { \"messages\": [{ \"body\": string }] }",
    "Each `body` is the verbatim message text as the agent wrote it, including casing, punctuation, and emoji.",
    "If you cannot tell who is the agent, return BOTH sides and we will let a human filter.",
    "Return between 0 and 12 messages.",
  ].join(" ");

  return {
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: systemPrompt },
          { type: "image_url", image_url: { url: dataUri } },
        ],
      },
    ],
    temperature: 0.1,
    max_tokens: 1600,
  };
}

/**
 * Wrap the OpenAI vision call in a 20s timeout + one retry. Timeouts and
 * AbortErrors both count as retryable; an HTTP error (4xx/5xx) does not.
 * Exposed for tests via `fetchImpl`.
 */
export async function callVisionWithRetry(params: {
  apiKey: string;
  requestBody: Record<string, unknown>;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
}): Promise<string> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const maxAttempts = params.maxAttempts ?? 2;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);
    try {
      const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${params.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(params.requestBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`OpenAI vision request failed: ${response.status} ${detail}`);
      }

      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return json.choices?.[0]?.message?.content ?? "";
    } catch (error) {
      lastError = error;
      const isAbort = error instanceof Error
        && (error.name === "AbortError" || error.message.toLowerCase().includes("abort"));
      if (!isAbort || attempt >= maxAttempts) {
        throw error;
      }
      // Retry on abort/timeout only.
    } finally {
      clearTimeout(timer);
    }
  }

  // Unreachable — loop either returns or throws — but TypeScript wants it.
  throw lastError instanceof Error ? lastError : new Error("OpenAI vision call failed");
}

export function parseVisionMessages(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as { messages?: Array<{ body?: unknown }> };
    const list = Array.isArray(parsed.messages) ? parsed.messages : [];
    return list
      .map((entry) => (typeof entry.body === "string" ? entry.body.trim() : ""))
      .filter((body): body is string => body.length >= 4)
      .slice(0, 12);
  } catch {
    return splitTextIntoMessages(content).slice(0, 12);
  }
}

async function debitVisionCredit(params: { workspaceId: string }): Promise<void> {
  const supabase = createServerSupabaseClient();
  const capacity = await checkPlanCapacity(supabase, {
    workspaceId: params.workspaceId,
    eventType: "social_turn",
  });
  await recordBillingUsageEvent(supabase, {
    workspaceId: params.workspaceId,
    eventType: "social_turn",
    idempotencyKey: `extract_vision:${params.workspaceId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
    retailCents: capacity.retailCents,
    cogsCents: capacity.cogsCents,
    eventMetadata: { source: "onboarding_reply_extract" },
  });
}

function splitTextIntoMessages(text: string): string[] {
  return text
    .split(/\n{2,}|^\s*[-•]\s+/m)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 4)
    .slice(0, 20);
}
