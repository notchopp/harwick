import { createHash } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  handlePublicListingChat,
  PublicListingChatError,
} from "../../../../../features/public-listings/public-listing-chat";
import { generateListingChatReply } from "../../../../../features/public-listings/listing-chat-generator";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createSupabasePublicListingChatRepository } from "../../../../../lib/supabase/public-listing-chat";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const SESSION_COOKIE_NAME = "harwick_listing_session";
// 30 days — same as the DB session expiry on public_listing_sessions.
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hashClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? null;
  if (ip === null || ip.length === 0) return null;
  // 16-char truncation matches our Sentry hashIdentifier convention.
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

/**
 * POST /[workspaceSlug]/api/listings/chat
 * Public, listing-aware Harwick conversation endpoint. This answers from
 * persisted listing facts and returns qualification deltas without creating a
 * lead until the visitor gives enough contact context through the inquiry path.
 */
export async function POST(
  request: NextRequest,
  props: {
    params: Promise<{
      workspaceSlug: string;
    }>;
  },
) {
  const { workspaceSlug } = await props.params;
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const environment = getServerEnvironment();
    if (environment.OPENAI_API_KEY === undefined || environment.OPENAI_API_KEY.length === 0) {
      return NextResponse.json({ error: "openai_unavailable" }, { status: 503 });
    }
    const openaiApiKey = environment.OPENAI_API_KEY;
    // Same default operator-side harwick-chat uses — gpt-4o is the
    // tool-capable model that handles streamText reliably. Smaller models
    // (mini, nano) have intermittent tool-call issues.
    const model = process.env["OPENAI_PUBLIC_LISTING_CHAT_MODEL"]
      ?? environment.OPENAI_REPLY_MODEL
      ?? "gpt-4o";

    const result = await handlePublicListingChat({
      workspaceSlug,
      request: body,
      repository: createSupabasePublicListingChatRepository(createServerSupabaseClient()),
      generator: (params) => generateListingChatReply({ ...params, openaiApiKey, model, findOtherListings: params.findOtherListings }),
      sessionToken: request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null,
      ipHash: hashClientIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    const response = NextResponse.json(result.response, { status: 200 });
    // Set the cookie on first turn so the visitor's next message lands on
    // the same server-side session. Refresh on every turn is fine too —
    // it just slides the expiry forward.
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: result.sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    if (error instanceof PublicListingChatError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request", details: error.flatten() }, { status: 400 });
    }

    console.error("Public listing chat error:", error);
    // In dev, surface the full underlying error payload. Supabase
    // throws PostgrestError objects (plain objects with
    // {message, code, details, hint}), not Error instances — so the
    // earlier `String(error)` collapsed them to "[object Object]".
    // Now we extract the shape regardless of whether it's an Error
    // instance, a PostgrestError, or any other thrown value.
    if (process.env.NODE_ENV !== "production") {
      const payload: Record<string, unknown> = { error: "internal_error" };
      if (error instanceof Error) {
        payload["devMessage"] = error.message;
        payload["devStack"] = error.stack;
        if (error.cause !== undefined) {
          payload["devCause"] = error.cause instanceof Error ? error.cause.message : error.cause;
        }
      } else if (typeof error === "object" && error !== null) {
        // PostgrestError + other object-shape thrown values.
        const obj = error as Record<string, unknown>;
        payload["devMessage"] = obj["message"] ?? "(object thrown without message)";
        payload["devCode"] = obj["code"];
        payload["devDetails"] = obj["details"];
        payload["devHint_supabase"] = obj["hint"];
        payload["devRaw"] = obj;
      } else {
        payload["devMessage"] = String(error);
      }
      const msg = typeof payload["devMessage"] === "string" ? payload["devMessage"] : "";
      if (msg.includes("does not exist") || msg.includes("schema cache") || payload["devCode"] === "PGRST205" || payload["devCode"] === "42P01") {
        payload["devHint"] = "One of public_listing_sessions / public_listing_session_turns / listing_memory is not migrated yet. Run `npm run supabase:migrate supabase/migrations/20260525000100_listing_memory.sql` then `npm run supabase:migrate supabase/migrations/20260525000200_public_listing_sessions.sql` from the repo root.";
      }
      return NextResponse.json(payload, { status: 500 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
