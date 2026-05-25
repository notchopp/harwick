import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * GET /api/workspaces/[workspaceId]/integration-status
 *
 * One-shot aggregator for the "what's live today" surface on /settings.
 * Reads connection state for every channel a workspace can light up:
 * FUB, Meta (Instagram + Facebook), Google Calendar (per-member),
 * Retell voice agent, Stripe billing, Twilio SMS.
 *
 * Returns null for any channel that isn't connected. The settings page
 * decides how to display ("connect" CTA vs "live" badge).
 */

type IntegrationStatusResponse = {
  followUpBoss: { connected: boolean; providerAccountName: string | null };
  meta: { connected: boolean; providerAccountName: string | null };
  googleCalendar: { connectedMemberCount: number; totalMemberCount: number };
  retell: { provisioned: boolean; phoneNumber: string | null; status: string | null };
  stripe: { active: boolean; status: string | null };
  twilio: { connected: boolean };
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId: raw } = await context.params;
  const parsed = UuidSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const workspaceId = parsed.data;

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();

  const [integrationsRes, calConnectionsRes, totalMembersRes, voiceRes, workspaceRes] = await Promise.all([
    supabase
      .from("integration_accounts")
      .select("provider, provider_account_name, status")
      .eq("workspace_id", workspaceId)
      .eq("status", "connected"),
    supabase
      .from("workspace_member_calendar_connections")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    supabase
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    supabase
      .from("workspace_voice_agents")
      .select("phone_number, status")
      .eq("workspace_id", workspaceId)
      .maybeSingle<{ phone_number: string | null; status: string | null }>(),
    supabase
      .from("workspaces")
      .select("subscription_status")
      .eq("id", workspaceId)
      .maybeSingle<{ subscription_status: string | null }>(),
  ]);

  const integrations = integrationsRes.data ?? [];
  const fub = integrations.find((row) => row.provider === "follow_up_boss");
  const meta = integrations.find((row) => row.provider === "meta");
  const twilio = integrations.find((row) => row.provider === "twilio");

  const response: IntegrationStatusResponse = {
    followUpBoss: {
      connected: fub !== undefined,
      providerAccountName: fub?.provider_account_name ?? null,
    },
    meta: {
      connected: meta !== undefined,
      providerAccountName: meta?.provider_account_name ?? null,
    },
    googleCalendar: {
      connectedMemberCount: calConnectionsRes.count ?? 0,
      totalMemberCount: totalMembersRes.count ?? 0,
    },
    retell: {
      provisioned: voiceRes.data !== null,
      phoneNumber: voiceRes.data?.phone_number ?? null,
      status: voiceRes.data?.status ?? null,
    },
    stripe: {
      active: workspaceRes.data?.subscription_status === "active" || workspaceRes.data?.subscription_status === "trialing",
      status: workspaceRes.data?.subscription_status ?? null,
    },
    twilio: {
      connected: twilio !== undefined,
    },
  };

  return NextResponse.json(response, { status: 200 });
}
