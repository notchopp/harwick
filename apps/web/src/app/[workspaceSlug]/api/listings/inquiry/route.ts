import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { pushLeadToFollowUpBoss } from "../../../../../features/crm/follow-up-boss-push";
import {
  handlePublicListingInquiry,
  PublicListingInquiryError,
} from "../../../../../features/public-listings/public-listing-inquiry";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../../lib/server-env";
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
    const supabase = createServerSupabaseClient();
    const result = await handlePublicListingInquiry({
      workspaceSlug,
      listingId: request.nextUrl.searchParams.get("listingId"),
      request: body,
      repository: createSupabasePublicListingInquiryRepository(supabase),
    });

    // Fire-and-forget FUB push. Failures are logged but never block the user-facing response —
    // the lead is already persisted in Harwick. Async sync via fub_sync queue (GTM-2) handles retry.
    const environment = getServerEnvironment();
    if (environment.CREDENTIAL_ENCRYPTION_KEY !== undefined) {
      void pushLeadToFollowUpBoss({
        supabase,
        credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
        workspaceId: result.workspaceId,
        leadId: result.leadId,
        lead: result.lead,
        listing: result.listingContext,
        source: "listings_site",
      }).then((outcome) => {
        if (!outcome.pushed && outcome.reason !== "no_credential") {
          console.warn(
            "[fub_push] sync failed; lead persisted in Harwick only",
            { reason: outcome.reason, error: outcome.error, leadId: result.leadId },
          );
        }
      }).catch((error) => {
        console.error("[fub_push] unexpected error", error);
      });
    }

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
