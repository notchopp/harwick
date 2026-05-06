import { RouteLeadResponseSchema, UuidSchema } from "@realty-ops/core";
import { ZodError } from "zod";
import { NextResponse, type NextRequest } from "next/server";
import { routeLeadWithHarwick } from "../../../../../../../features/leads/lead-routing-action";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createSupabaseAuditLogRepository } from "../../../../../../../lib/supabase/audit-logs";
import { createSupabaseLeadRoutingActionRepository } from "../../../../../../../lib/supabase/leads";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    leadId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
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
    body = {};
  }

  try {
    const supabase = createServerSupabaseClient();
    const result = await routeLeadWithHarwick({
      workspaceId,
      leadId,
      viewer: {
        memberId: membership.memberId,
        role: membership.role,
      },
      input: body,
      repository: createSupabaseLeadRoutingActionRepository(supabase),
      auditRepository: createSupabaseAuditLogRepository(supabase),
    });

    if (result.status === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (result.status === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json(RouteLeadResponseSchema.parse(result.response), { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    console.error("POST lead routing error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
