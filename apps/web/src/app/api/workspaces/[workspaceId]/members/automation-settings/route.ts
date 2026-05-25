import {
  HarwickAiAutomationSettingsRequestSchema,
  HarwickAiAutomationSettingsResponseSchema,
  UuidSchema,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";
import type { HarwickAiAutomationPolicyRow } from "../../../../../../lib/supabase/database.types";

export const runtime = "nodejs";

const DEFAULT_AUTOMATION_SETTINGS = {
  autoSendEnabled: false,
  confidenceThreshold: 0.78,
};

function settingsFromRow(row: Pick<HarwickAiAutomationPolicyRow, "auto_send_enabled" | "confidence_threshold"> | null) {
  if (row === null) {
    return DEFAULT_AUTOMATION_SETTINGS;
  }

  return {
    autoSendEnabled: row.auto_send_enabled,
    confidenceThreshold: Number(row.confidence_threshold),
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const params = await context.params;
  const workspaceId = UuidSchema.safeParse(params.workspaceId);
  if (!workspaceId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId: workspaceId.data });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();
  const { data: memberPolicy, error: memberError } = await supabase
    .from("harwick_ai_automation_policies")
    .select("auto_send_enabled,confidence_threshold")
    .eq("workspace_id", workspaceId.data)
    .eq("member_id", membership.memberId)
    .eq("scope", "member")
    .maybeSingle<Pick<HarwickAiAutomationPolicyRow, "auto_send_enabled" | "confidence_threshold">>();

  if (memberError !== null) {
    return NextResponse.json({ error: "automation_settings_read_failed" }, { status: 500 });
  }

  if (memberPolicy !== null) {
    return NextResponse.json(HarwickAiAutomationSettingsResponseSchema.parse(settingsFromRow(memberPolicy)));
  }

  const { data: workspacePolicy, error: workspaceError } = await supabase
    .from("harwick_ai_automation_policies")
    .select("auto_send_enabled,confidence_threshold")
    .eq("workspace_id", workspaceId.data)
    .eq("scope", "workspace")
    .maybeSingle<Pick<HarwickAiAutomationPolicyRow, "auto_send_enabled" | "confidence_threshold">>();

  if (workspaceError !== null) {
    return NextResponse.json({ error: "automation_settings_read_failed" }, { status: 500 });
  }

  return NextResponse.json(HarwickAiAutomationSettingsResponseSchema.parse(settingsFromRow(workspacePolicy)));
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const params = await context.params;
  const workspaceId = UuidSchema.safeParse(params.workspaceId);
  if (!workspaceId.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId: workspaceId.data });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsedBody = HarwickAiAutomationSettingsRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data: existingPolicy, error: existingError } = await supabase
    .from("harwick_ai_automation_policies")
    .select("id")
    .eq("workspace_id", workspaceId.data)
    .eq("member_id", membership.memberId)
    .eq("scope", "member")
    .maybeSingle<Pick<HarwickAiAutomationPolicyRow, "id">>();

  if (existingError !== null) {
    return NextResponse.json({ error: "automation_settings_update_failed" }, { status: 500 });
  }

  const patch = {
    auto_send_enabled: parsedBody.data.autoSendEnabled,
    confidence_threshold: parsedBody.data.confidenceThreshold,
    updated_at: new Date().toISOString(),
  };

  const result = existingPolicy === null
    ? await supabase
        .from("harwick_ai_automation_policies")
        .insert({
          ...patch,
          workspace_id: workspaceId.data,
          member_id: membership.memberId,
          scope: "member",
        })
    : await supabase
        .from("harwick_ai_automation_policies")
        .update(patch)
        .eq("id", existingPolicy.id)
        .eq("workspace_id", workspaceId.data);

  if (result.error !== null) {
    return NextResponse.json({ error: "automation_settings_update_failed" }, { status: 500 });
  }

  return NextResponse.json(HarwickAiAutomationSettingsResponseSchema.parse(parsedBody.data));
}
