import {
  MemberRoutingProfileCreateRequestSchema,
  MemberRoutingProfileListResponseSchema,
  type MemberRoutingProfileResponse,
  UuidSchema,
  canManageWorkspaceRouting,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import {
  createSupabaseMemberRoutingProfileRepository,
} from "../../../../../lib/supabase/member-routing-profiles";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";
import type { WorkspaceMemberRow } from "../../../../../lib/supabase/database.types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const repository = createSupabaseMemberRoutingProfileRepository(supabase);

  const profiles = await repository.listProfilesForWorkspace(workspaceId);

  const memberIds = profiles.map((profile) => profile.member_id);
  const { data: members, error: membersError } = await supabase
    .from("workspace_members")
    .select("id,display_name")
    .in("id", memberIds)
    .returns<Array<Pick<WorkspaceMemberRow, "id" | "display_name">>>();

  if (membersError !== null) {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  const memberMap = new Map(members.map((member) => [member.id, member.display_name]));

  const response: MemberRoutingProfileResponse[] = profiles.map((profile) => ({
    id: profile.id,
    workspaceId: profile.workspace_id,
    memberId: profile.member_id,
    memberDisplayName: memberMap.get(profile.member_id) ?? "Unknown",
    roleLabel: profile.role_label,
    areas: profile.areas,
    propertyTypes: profile.property_types as MemberRoutingProfileResponse["propertyTypes"],
    leadTypes: profile.lead_types.filter((lt): lt is "buyer" | "seller" | "renter" | "investor" =>
      lt !== "unknown"
    ),
    budgetMin: profile.budget_min,
    budgetMax: profile.budget_max,
    maxActiveLeads: profile.max_active_leads,
    acceptsNewLeads: profile.accepts_new_leads,
    notificationPreference: profile.notification_preference,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  }));

  const validated = MemberRoutingProfileListResponseSchema.parse({ profiles: response });

  return NextResponse.json(validated, { status: 200 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success) {
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

  const parsed = MemberRoutingProfileCreateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", details: parsed.error.format() }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const repository = createSupabaseMemberRoutingProfileRepository(supabase);

  const existingProfile = await repository.findProfileByMemberId({
    workspaceId,
    memberId: parsed.data.memberId,
  });

  if (existingProfile !== null) {
    return NextResponse.json({ error: "profile_already_exists" }, { status: 409 });
  }

  const { data: member, error: memberError } = await supabase
    .from("workspace_members")
    .select("id,display_name")
    .eq("workspace_id", workspaceId)
    .eq("id", parsed.data.memberId)
    .eq("is_active", true)
    .maybeSingle<Pick<WorkspaceMemberRow, "id" | "display_name">>();

  if (memberError !== null || member === null) {
    return NextResponse.json({ error: "member_not_found" }, { status: 404 });
  }

  const profile = await repository.insertProfile({
    workspace_id: workspaceId,
    member_id: parsed.data.memberId,
    role_label: parsed.data.roleLabel,
    areas: parsed.data.areas,
    property_types: parsed.data.propertyTypes,
    lead_types: parsed.data.leadTypes,
    budget_min: parsed.data.budgetMin,
    budget_max: parsed.data.budgetMax,
    max_active_leads: parsed.data.maxActiveLeads,
    accepts_new_leads: parsed.data.acceptsNewLeads,
    notification_preference: parsed.data.notificationPreference,
  });

  const response: MemberRoutingProfileResponse = {
    id: profile.id,
    workspaceId: profile.workspace_id,
    memberId: profile.member_id,
    memberDisplayName: member.display_name,
    roleLabel: profile.role_label,
    areas: profile.areas,
    propertyTypes: profile.property_types as MemberRoutingProfileResponse["propertyTypes"],
    leadTypes: profile.lead_types.filter((lt): lt is "buyer" | "seller" | "renter" | "investor" =>
      lt !== "unknown"
    ),
    budgetMin: profile.budget_min,
    budgetMax: profile.budget_max,
    maxActiveLeads: profile.max_active_leads,
    acceptsNewLeads: profile.accepts_new_leads,
    notificationPreference: profile.notification_preference,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };

  return NextResponse.json(response, { status: 201 });
}
