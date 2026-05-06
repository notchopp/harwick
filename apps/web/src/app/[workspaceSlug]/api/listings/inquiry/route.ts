import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import {
  handlePublicListingInquiry,
  PublicListingInquiryError,
} from "../../../../../features/public-listings/public-listing-inquiry";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../lib/rate-limit";
import { createSupabasePublicListingInquiryRepository } from "../../../../../lib/supabase/public-listing-inquiry";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * POST /[workspaceSlug]/api/listings/inquiry
 * Public endpoint for listing inquiry form submissions.
 * Creates or updates a lead, writes a lead event, and queues showing approval
 * or open-house registration tasks when the visitor explicitly requests them.
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
    key: rateLimitKeyFromRequest({ request, namespace: "public-listing-inquiry" }),
    limit: 20,
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
    const result = await handlePublicListingInquiry({
      workspaceSlug,
      listingId: request.nextUrl.searchParams.get("listingId"),
      request: body,
      repository: createSupabasePublicListingInquiryRepository(createServerSupabaseClient()),
    });

    return NextResponse.json(
      {
        success: true,
        leadId: result.leadId,
        showingTaskId: result.showingTaskId,
        openHouseRegistrationTaskId: result.openHouseRegistrationTaskId,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PublicListingInquiryError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }

    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request", details: error.flatten() }, { status: 400 });
    }

    console.error("Listing inquiry error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
