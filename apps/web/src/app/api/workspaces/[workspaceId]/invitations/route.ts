import { randomBytes } from "node:crypto";

import {
  UuidSchema,
  WorkspaceInvitationCreateRequestSchema,
  WorkspaceInvitationCreateResponseSchema,
  type BillingPlanTier,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { getWorkspaceSubscription } from "../../../../../lib/supabase/billing";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const ALLOWED_INVITER_ROLES = new Set(["owner", "admin"] as const);

// Mirror packages/core PLAN_LIMITS.maxSeats so we can gate without
// importing the full plan limits structure here.
const PLAN_SEAT_LIMITS: Record<BillingPlanTier, number> = {
  free: 1,
  solo: 2,
  team: 10,
  brokerage: Number.POSITIVE_INFINITY,
};

function generateInvitationToken(): string {
  return randomBytes(24).toString("base64url");
}

function appBaseUrl(): string {
  const fromEnv = process.env["NEXT_PUBLIC_APP_URL"];
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv.replace(/\/+$/, "");
  }
  return "https://harwick.lol";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId: rawWorkspaceId } = await context.params;
  const parsed = UuidSchema.safeParse(rawWorkspaceId);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_workspace" }, { status: 400 });
  }
  const workspaceId = parsed.data;

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: ALLOWED_INVITER_ROLES,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = WorkspaceInvitationCreateRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Touch env so misconfigured deploys fail loud instead of throwing 500
  // mid-handler.
  try {
    getServerEnvironment();
  } catch {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const supabase = createServerSupabaseClient();

  // Plan seat gate — count active members + pending unaccepted invites and
  // reject if accepting one more would exceed the plan limit.
  const subscription = await getWorkspaceSubscription(supabase, workspaceId);
  const planTier: BillingPlanTier = subscription?.planTier ?? "free";
  const seatLimit = PLAN_SEAT_LIMITS[planTier];

  if (Number.isFinite(seatLimit)) {
    const [{ count: activeCount, error: activeError }, { count: pendingCount, error: pendingError }] = await Promise.all([
      supabase
        .from("workspace_members")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("is_active", true),
      supabase
        .from("workspace_invitations")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .is("accepted_at", null)
        .is("revoked_at", null),
    ]);
    if (activeError !== null || pendingError !== null) {
      return NextResponse.json(
        { error: "seat_count_failed", message: activeError?.message ?? pendingError?.message },
        { status: 500 },
      );
    }
    const projectedSeats = (activeCount ?? 0) + (pendingCount ?? 0) + 1;
    if (projectedSeats > seatLimit) {
      return NextResponse.json(
        {
          error: "plan_seat_limit",
          planTier,
          seatLimit,
          activeCount: activeCount ?? 0,
          pendingCount: pendingCount ?? 0,
        },
        { status: 402 },
      );
    }
  }

  // Reuse an existing pending invite for the same (workspace, email) so the
  // operator gets the same URL if they invite the same person twice.
  const { data: existing, error: existingError } = await supabase
    .from("workspace_invitations")
    .select("id,token,expires_at")
    .eq("workspace_id", workspaceId)
    .eq("email", body.data.email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (existingError !== null) {
    return NextResponse.json(
      { error: "invitation_lookup_failed", message: existingError.message },
      { status: 500 },
    );
  }

  let invitationId: string;
  let token: string;
  let expiresAt: string;

  if (existing !== null) {
    invitationId = existing.id;
    token = existing.token;
    expiresAt = existing.expires_at;
  } else {
    token = generateInvitationToken();
    const { data: inserted, error: insertError } = await supabase
      .from("workspace_invitations")
      .insert({
        workspace_id: workspaceId,
        invited_by_member_id: membership.memberId,
        email: body.data.email,
        role: body.data.role,
        token,
      })
      .select("id,expires_at")
      .single();
    if (insertError !== null) {
      return NextResponse.json(
        { error: "invitation_create_failed", message: insertError.message },
        { status: 500 },
      );
    }
    invitationId = inserted.id;
    expiresAt = inserted.expires_at;
  }

  const inviteUrl = `${appBaseUrl()}/invite/${token}`;
  const response = WorkspaceInvitationCreateResponseSchema.parse({
    invitationId,
    token,
    inviteUrl,
    expiresAt,
  });
  return NextResponse.json(response, { status: 201 });
}
