import {
  UpdateLeadQualificationResponseSchema,
  UuidSchema,
} from "@realty-ops/core";
import { ZodError } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { updateLeadQualification } from "../../../../../../features/leads/lead-qualification-update";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createSupabaseAuditLogRepository } from "../../../../../../lib/supabase/audit-logs";
import { createSupabaseLeadQualificationRepository } from "../../../../../../lib/supabase/leads";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    leadId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { workspaceId, leadId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(leadId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const result = await updateLeadQualification({
      workspaceId,
      leadId,
      viewer: {
        memberId: membership.memberId,
        role: membership.role,
      },
      input: body,
      repository: createSupabaseLeadQualificationRepository(supabase),
      auditRepository: createSupabaseAuditLogRepository(supabase),
    });

    if (result.status === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (result.status === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json(UpdateLeadQualificationResponseSchema.parse({
      leadId: result.leadId,
      updated: true,
    }), { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    console.error("PATCH lead qualification error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
