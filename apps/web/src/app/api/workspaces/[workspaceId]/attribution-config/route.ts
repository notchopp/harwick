import { UuidSchema, AttributionConfigSchema, type AttributionStyle } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * GET — return the workspace's current attribution config.
 * PUT — update it. Tier gating enforced server-side:
 *   - Free: locked to via_harwick
 *   - $299 Starter: can choose via_harwick variants
 *   - $799 Growth: can choose co_brand
 *   - $1500 Brokerage: can choose minimal
 *   - Enterprise (custom plan): can choose custom or removed
 *
 * Free + Starter callers attempting to set co_brand/minimal/custom/removed
 * get 403 with an upgrade hint.
 */

const PutBody = z.object({
  attributionConfig: AttributionConfigSchema,
});

const ALLOWED_STYLES_BY_PLAN: Record<string, AttributionStyle[]> = {
  free: ["via_harwick"],
  starter: ["via_harwick"],
  growth: ["via_harwick", "co_brand"],
  brokerage: ["via_harwick", "co_brand", "minimal"],
  enterprise: ["via_harwick", "co_brand", "minimal", "custom", "removed"],
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data } = await untyped
    .from("workspaces")
    .select("attribution_config, plan_tier")
    .eq("id", workspaceId)
    .maybeSingle();

  const plan = (data?.plan_tier as string | null) ?? "free";
  return NextResponse.json({
    attributionConfig: data?.attribution_config ?? {
      style: "via_harwick",
      customText: null,
      workspaceLabel: null,
    },
    allowedStyles: ALLOWED_STYLES_BY_PLAN[plan] ?? ALLOWED_STYLES_BY_PLAN["free"],
    planTier: plan,
  });
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = PutBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data: workspace } = await untyped
    .from("workspaces")
    .select("plan_tier")
    .eq("id", workspaceId)
    .maybeSingle();
  const plan = (workspace?.plan_tier as string | null) ?? "free";
  const allowedStyles = ALLOWED_STYLES_BY_PLAN[plan] ?? ALLOWED_STYLES_BY_PLAN["free"]!;
  if (!allowedStyles.includes(parsed.data.attributionConfig.style)) {
    return NextResponse.json({
      error: "plan_required",
      message: `Style "${parsed.data.attributionConfig.style}" requires a higher plan tier. Current plan: ${plan}.`,
      allowedStyles,
    }, { status: 403 });
  }

  const { error } = await untyped
    .from("workspaces")
    .update({ attribution_config: parsed.data.attributionConfig, updated_at: new Date().toISOString() })
    .eq("id", workspaceId);
  if (error !== null && error !== undefined) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
