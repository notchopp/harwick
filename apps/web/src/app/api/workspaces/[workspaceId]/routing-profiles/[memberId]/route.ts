import {
  MemberRoutingProfileResponseSchema,
  MemberRoutingProfileUpdateRequestSchema,
  type MemberRoutingProfileResponse,
  UuidSchema,
  canManageWorkspaceRouting,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import {
  createSupabaseMemberRoutingProfileRepository,
} from "../../../../../../lib/supabase/member-routing-profiles";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";
import type { WorkspaceMemberRow } from "../../../../../../lib/supabase/database.types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    memberId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId, memberId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(memberId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const repository = createSupabaseMemberRoutingProfileRepository(supabase);

  const profile = await repository.findProfileByMemberId({ workspaceId, memberId });
  if (profile === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: member, error: memberError } = await supabase
    .from("workspace_members")
    .select("display_name")
    .eq("id", memberId)
    .maybeSingle<Pick<WorkspaceMemberRow, "display_name">>();

  if (memberError !== null) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const response: MemberRoutingProfileResponse = {
    id: profile.id,
    workspaceId: profile.workspace_id,
    memberId: profile.member_id,
    memberDisplayName: member?.display_name ?? "Unknown",
    roleLabel: profile.role_label,
    areas: profile.areas,
    propertyTypes: profile.property_types as MemberRoutingProfileResponse["propertyTypes"],
    leadTypes: profile.lead_types.filter((lt: string): lt is "buyer" | "seller" | "renter" | "investor" =>
      lt !== "unknown"
    ),
    budgetMin: profile.budget_min,
    budgetMax: profile.budget_max,
    maxActiveLeads: profile.max_active_leads,
    acceptsNewLeads: profile.accepts_new_leads,
    notificationPreference: profile.notification_preference as MemberRoutingProfileResponse["notificationPreference"],
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };

  const validated = MemberRoutingProfileResponseSchema.parse(response);

  return NextResponse.json(validated, { status: 200 });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { workspaceId, memberId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(memberId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!canManageWorkspaceRouting(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = MemberRoutingProfileUpdateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", details: parsed.error.format() }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const repository = createSupabaseMemberRoutingProfileRepository(supabase);

  const existingProfile = await repository.findProfileByMemberId({ workspaceId, memberId });
  if (existingProfile === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const updateRow: Record<string, unknown> = {};
  if (parsed.data.roleLabel !== undefined) updateRow["role_label"] = parsed.data.roleLabel;
  if (parsed.data.areas !== undefined) updateRow["areas"] = parsed.data.areas;
  if (parsed.data.propertyTypes !== undefined) updateRow["property_types"] = parsed.data.propertyTypes;
  if (parsed.data.leadTypes !== undefined) updateRow["lead_types"] = parsed.data.leadTypes;
  if (parsed.data.budgetMin !== undefined) updateRow["budget_min"] = parsed.data.budgetMin;
  if (parsed.data.budgetMax !== undefined) updateRow["budget_max"] = parsed.data.budgetMax;
  if (parsed.data.maxActiveLeads !== undefined) updateRow["max_active_leads"] = parsed.data.maxActiveLeads;
  if (parsed.data.acceptsNewLeads !== undefined) updateRow["accepts_new_leads"] = parsed.data.acceptsNewLeads;
  if (parsed.data.notificationPreference !== undefined) {
    updateRow["notification_preference"] = parsed.data.notificationPreference;
  }

  const profile = await repository.updateProfile({
    workspaceId,
    memberId,
    row: updateRow,
  });

  const { data: member } = await supabase
    .from("workspace_members")
    .select("display_name")
    .eq("id", memberId)
    .maybeSingle<Pick<WorkspaceMemberRow, "display_name">>();

  const response: MemberRoutingProfileResponse = {
    id: profile.id,
    workspaceId: profile.workspace_id,
    memberId: profile.member_id,
    memberDisplayName: member?.display_name ?? "Unknown",
    roleLabel: profile.role_label,
    areas: profile.areas,
    propertyTypes: profile.property_types as MemberRoutingProfileResponse["propertyTypes"],
    leadTypes: profile.lead_types.filter((lt: string): lt is "buyer" | "seller" | "renter" | "investor" =>
      lt !== "unknown"
    ),
    budgetMin: profile.budget_min,
    budgetMax: profile.budget_max,
    maxActiveLeads: profile.max_active_leads,
    acceptsNewLeads: profile.accepts_new_leads,
    notificationPreference: profile.notification_preference as MemberRoutingProfileResponse["notificationPreference"],
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };

  return NextResponse.json(response, { status: 200 });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { workspaceId, memberId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(memberId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!canManageWorkspaceRouting(membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const repository = createSupabaseMemberRoutingProfileRepository(supabase);

  const existingProfile = await repository.findProfileByMemberId({ workspaceId, memberId });
  if (existingProfile === null) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await repository.deleteProfile({ workspaceId, memberId });

  return NextResponse.json({ success: true }, { status: 200 });
}
