import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { markLeadOutcome, type LeadOutcome } from "../../../../../features/judgment-tools/lifecycle-tracker";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";

export const runtime = "nodejs";

const Body = z.object({
  workspaceId: UuidSchema,
  outcome: z.enum([
    "closed_won",
    "closed_lost",
    "marked_spam",
    "reassigned",
    "task_completed",
    "task_skipped",
  ]),
});

/**
 * Mark a lead with a lifecycle outcome (closed_won / closed_lost / etc).
 * Phase 1: operator-callable from the lead drawer or directly via API.
 * Phase 2: auto-fire from the FUB webhook so this happens without
 * operator action when their CRM reports the outcome.
 */
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await props.params;
  const parsedLead = UuidSchema.safeParse(leadId);
  if (!parsedLead.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = Body.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: parsed.data.workspaceId,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await markLeadOutcome({
    workspaceId: parsed.data.workspaceId,
    leadId: parsedLead.data,
    outcome: parsed.data.outcome as LeadOutcome,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "internal_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updatedSignalCount: result.updatedSignalCount });
}
