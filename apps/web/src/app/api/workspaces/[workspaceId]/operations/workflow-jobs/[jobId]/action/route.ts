import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { actOnWorkflowJobFailure } from "../../../../../../../../features/operations/failure-operations";
import { authorizeWorkspaceRequest } from "../../../../../../../../lib/api/workspace-auth";
import { createSupabaseFailureOperationsRepository } from "../../../../../../../../lib/supabase/failure-operations";
import { createServerSupabaseClient } from "../../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    jobId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId, jobId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(jobId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const allowedRoles = new Set(["owner", "admin", "lead_manager"] as const);
  const membership = await authorizeWorkspaceRequest({ request, workspaceId, allowedRoles });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const item = await actOnWorkflowJobFailure({
      workspaceId,
      jobId,
      request: body,
      repository: createSupabaseFailureOperationsRepository(createServerSupabaseClient()),
    });

    return item === null
      ? NextResponse.json({ error: "not_found" }, { status: 404 })
      : NextResponse.json({ item }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    throw error;
  }
}
