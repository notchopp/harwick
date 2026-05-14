import {
  AuditLogResourceTypeSchema,
  UuidSchema,
  type AuditLogResourceType,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { createSupabaseAuditLogRepository } from "../../../../../lib/supabase/audit-logs";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * Records operator feedback on a workspace surface that does NOT have a stable
 * (trajectoryId, stepId) attribution (e.g. routing decisions, proactive rail
 * cards, synthesis fields, workspace memory). For surfaces that DO have step
 * attribution (AI message bubbles, conversation tool activity entries), use
 * /api/workspaces/{ws}/agent-trajectories/{tid}/steps/{sid}/tag instead — that
 * writes a proper agent_outcomes row attributed to the exact step.
 *
 * This route stores feedback in audit_logs with action "training.surface_feedback".
 * Querying for training extraction: `WHERE action = 'training.surface_feedback'`.
 * A follow-up migration can move this to a dedicated table once we know the shape.
 */
const SurfaceFeedbackSchema = z.object({
  surface: AuditLogResourceTypeSchema,
  resourceId: z.string().trim().min(1).max(200),
  tag: z.enum(["positive", "negative", "note"]),
  note: z.string().trim().max(2000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

type RouteContext = {
  params: Promise<{ workspaceId: string }>;
};

const FEEDBACK_SURFACES = new Set<AuditLogResourceType>([
  "routing_decision",
  "proactive_card",
  "workspace_memory",
  "synthesis_field",
  "voice_handoff",
  "harwick_work_item",
  "lead",
  "conversation",
]);

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success) {
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
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = SurfaceFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!FEEDBACK_SURFACES.has(parsed.data.surface)) {
    return NextResponse.json({ error: "unsupported_surface" }, { status: 400 });
  }

  try {
    const repository = createSupabaseAuditLogRepository(createServerSupabaseClient());
    await repository.insertAuditLog({
      workspaceId,
      userId: null,
      actorType: "user",
      action: "training.surface_feedback",
      resourceType: parsed.data.surface,
      resourceId: null,
      metadata: {
        memberId: membership.memberId,
        surface: parsed.data.surface,
        surfaceResourceId: parsed.data.resourceId,
        tag: parsed.data.tag,
        note: parsed.data.note ?? null,
        context: parsed.data.context ?? {},
      },
    });
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "internal_error", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
