import {
  ListingUrlImportDraftSchema,
  ListingUrlImportRequestSchema,
  UuidSchema,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { importListingFromUrl } from "../../../../../../features/listings/url-importer";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../../lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 20;

const ALLOWED_ROLES = new Set(["owner", "admin", "team_lead", "lead_manager", "operator", "agent"] as const);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "listings-import-url" }),
    limit: 20,
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

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: parsedWorkspaceId.data,
    allowedRoles: ALLOWED_ROLES,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = ListingUrlImportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "invalid_request", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  const result = await importListingFromUrl(parsedBody.data.url);
  if (!result.ok) {
    const status = result.reason === "fetch_failed"
      ? 502
      : result.reason === "unsupported_content_type"
        ? 415
        : 422;
    return NextResponse.json(
      { error: result.reason, message: result.message },
      { status },
    );
  }

  const draft = ListingUrlImportDraftSchema.parse(result.draft);
  return NextResponse.json({ draft }, { status: 200 });
}
