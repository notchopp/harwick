import {
  UuidSchema,
  WorkspaceMemoryReviewListResponseSchema,
  WorkspaceMemoryReviewQuerySchema,
  WorkspaceMemoryReviewUpdateRequestSchema,
  WorkspaceMemoryReviewUpdateResponseSchema,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";
import { createSupabaseWorkspaceMemoryRepository } from "../../../../../lib/supabase/workspace-memory";

export const runtime = "nodejs";

const readRoles = new Set(["owner", "admin", "team_lead", "lead_manager", "operator"] as const);
const writeRoles = new Set(["owner", "admin", "team_lead"] as const);

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId: rawWorkspaceId } = await context.params;
  const workspaceId = UuidSchema.safeParse(rawWorkspaceId);
  if (!workspaceId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: workspaceId.data,
    allowedRoles: readRoles,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedQuery = WorkspaceMemoryReviewQuerySchema.safeParse({
    reviewStatus: request.nextUrl.searchParams.get("reviewStatus") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const repository = createSupabaseWorkspaceMemoryRepository(createServerSupabaseClient());
  const memories = await repository.listReviewableMemoryDocuments({
    workspaceId: workspaceId.data,
    limit: parsedQuery.data.limit,
    ...(parsedQuery.data.reviewStatus === undefined ? {} : { reviewStatus: parsedQuery.data.reviewStatus }),
  });

  return NextResponse.json(
    WorkspaceMemoryReviewListResponseSchema.parse({
      workspaceId: workspaceId.data,
      memories,
    }),
    { status: 200 },
  );
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { workspaceId: rawWorkspaceId } = await context.params;
  const workspaceId = UuidSchema.safeParse(rawWorkspaceId);
  if (!workspaceId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: workspaceId.data,
    allowedRoles: writeRoles,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = WorkspaceMemoryReviewUpdateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const repository = createSupabaseWorkspaceMemoryRepository(createServerSupabaseClient());
  const memory = await repository.updateMemoryReview({
    workspaceId: workspaceId.data,
    memoryId: parsedBody.data.memoryId,
    reviewStatus: parsedBody.data.reviewStatus,
    reviewedByMemberId: membership.memberId,
    reviewedAt: new Date().toISOString(),
    reviewNote: parsedBody.data.reviewNote ?? null,
  });

  return NextResponse.json(WorkspaceMemoryReviewUpdateResponseSchema.parse({ memory }), { status: 200 });
}
