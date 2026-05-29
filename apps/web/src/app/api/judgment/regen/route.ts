import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { runJudgmentDefault } from "../../../../features/judgment-tools/supabase-cache";
import { authorizeWorkspaceRequest } from "../../../../lib/api/workspace-auth";

export const runtime = "nodejs";

/**
 * POST /api/judgment/regen — internal endpoint for regenerating a brief.
 *
 * Called by:
 *   - CRM webhook handlers when an entity's external state changes
 *   - Entity-mutation hooks (lead update, task insert, etc.)
 *   - Background scheduled regen for triageQueue / briefWorkspace
 *
 * Idempotent: runs runJudgment with forceRegen=true. The runner handles
 * cache write + training_signal write. Returns the resulting envelope so
 * callers can confirm regen succeeded.
 *
 * Phase 0 behavior: since every tool's executor is currently a stub that
 * returns low confidence, this endpoint will return aborted envelopes
 * (low-conf, no cache write). It becomes load-bearing as tools are wired
 * in subsequent phases.
 */

const RegenBody = z.object({
  workspaceId: UuidSchema,
  tool: z.string().min(1),
  audience: z.object({
    role: z.string(),
    memberId: z.string().nullable().default(null),
    voicePersona: z.string().nullable().default(null),
    scope: z.enum(["personal", "team", "workspace"]).default("personal"),
  }),
  destination: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = RegenBody.safeParse(body);
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

  try {
    const result = await runJudgmentDefault({
      workspaceId: parsed.data.workspaceId,
      tool: parsed.data.tool as Parameters<typeof runJudgmentDefault>[0]["tool"],
      audience: parsed.data.audience as Parameters<typeof runJudgmentDefault>[0]["audience"],
      destination: parsed.data.destination as Parameters<typeof runJudgmentDefault>[0]["destination"],
      input: parsed.data.input,
      forceRegen: true,
    });
    return NextResponse.json({
      ok: true,
      envelope: result.envelope,
      cached: result.cached,
      model: result.model,
      costUsd: result.costUsd,
      trainingSignalId: result.trainingSignalId,
    });
  } catch (error) {
    console.error("/api/judgment/regen error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
