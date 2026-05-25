import { createLocalHarwickAiRuntime } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { createHarwickAiRuntime } from "../../../../../features/lead-intake/ai-sdk-runtime";
import {
  handlePublicListingChat,
  PublicListingChatError,
} from "../../../../../features/public-listings/public-listing-chat";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createSupabasePublicListingChatRepository } from "../../../../../lib/supabase/public-listing-chat";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

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
    const runtimeClient = environment.OPENAI_API_KEY === undefined && environment.APP_ENV === "development"
      ? createLocalHarwickAiRuntime()
      : createHarwickAiRuntime({
          apiKey: environment.OPENAI_API_KEY ?? "",
          model: environment.OPENAI_REPLY_MODEL,
        });

    const result = await handlePublicListingChat({
      workspaceSlug,
      request: body,
      repository: createSupabasePublicListingChatRepository(createServerSupabaseClient()),
      runtimeClient,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof PublicListingChatError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request", details: error.flatten() }, { status: 400 });
    }

    console.error("Public listing chat error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
