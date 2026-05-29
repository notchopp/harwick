import {
  getCrmConnector,
  type AttributionConfig,
  type Audience,
} from "@realty-ops/core";

import { runJudgmentDefault } from "./supabase-cache";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * Auto-push a fresh briefEntity(destination: crm_note) for a lead to the
 * workspace's configured CRM connector. Called from lead-mutation hooks
 * (lead update, qualification patch, status shift). Best-effort — failures
 * log but don't break the user-facing call path.
 *
 * The note that lands in FUB (or kvCore once that connector is implemented)
 * reads like a chief-of-staff briefing: who this person is, what's
 * captured, what's worth knowing next, dated, signed "— via Harwick".
 * That's how brokerage owners discover Harwick in the wild.
 */
export async function pushLeadBriefAsCrmNote(params: {
  workspaceId: string;
  leadId: string;
  triggerReason: string;
}): Promise<{ ok: boolean; pushed: boolean; reason?: string }> {
  try {
    const supabase = createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untyped = supabase as any;

    // Resolve workspace attribution config + the FUB contact id for this lead.
    const { data: workspace } = await untyped
      .from("workspaces")
      .select("attribution_config")
      .eq("id", params.workspaceId)
      .maybeSingle();
    const attribution: AttributionConfig = (workspace?.attribution_config as AttributionConfig | undefined) ?? {
      style: "via_harwick",
      customText: null,
      workspaceLabel: null,
    };

    const { data: lead } = await untyped
      .from("leads")
      .select("id, follow_up_boss_contact_id, full_name, phone, email, qualification_summary, lead_document, status, lead_type, intent, score, target_area, timeline, budget_min, budget_max, financing_status, assigned_agent_id, created_at, updated_at")
      .eq("id", params.leadId)
      .eq("workspace_id", params.workspaceId)
      .maybeSingle();
    if (lead === null || lead === undefined) {
      return { ok: false, pushed: false, reason: "lead_not_found" };
    }
    const fubContactId = lead.follow_up_boss_contact_id as string | null;
    if (fubContactId === null) {
      // Lead not synced to FUB yet — nothing to push to. This isn't an
      // error; the GTM-1 capture path will create the FUB contact and a
      // subsequent update will trigger this push.
      return { ok: true, pushed: false, reason: "no_crm_contact" };
    }

    // Pull related tasks + events so the brief has the full picture.
    const { data: tasks } = await untyped
      .from("lead_tasks")
      .select("id, task_type, status, priority, title, description, due_at, created_at, requested_start_at")
      .eq("workspace_id", params.workspaceId)
      .eq("lead_id", params.leadId)
      .order("created_at", { ascending: false })
      .limit(10);
    const { data: events } = await untyped
      .from("lead_events")
      .select("event_type, source_channel, text, occurred_at")
      .eq("workspace_id", params.workspaceId)
      .eq("lead_id", params.leadId)
      .order("occurred_at", { ascending: false })
      .limit(15);

    const audience: Audience = {
      role: "agent",
      memberId: null,
      voicePersona: null,
      scope: "personal",
    };

    const result = await runJudgmentDefault({
      workspaceId: params.workspaceId,
      tool: "briefEntity",
      audience,
      destination: "crm_note",
      input: {
        type: "lead",
        id: params.leadId,
        entityState: lead as unknown as Record<string, unknown>,
        relatedTasks: (tasks ?? []) as Array<Record<string, unknown>>,
        recentEvents: (events ?? []) as Array<Record<string, unknown>>,
        crmState: null,
        channelAvailability: {
          instagram: false,
          facebook: false,
          sms: false,
          voice: false,
          public_chat: true,
        },
      },
      forceRegen: true, // crm_note pushes always reflect freshest state
    });

    if (result.envelope.confidence < 0.55) {
      return { ok: true, pushed: false, reason: "low_confidence_brief" };
    }

    const connector = getCrmConnector("fub");
    if (connector === null) {
      return { ok: false, pushed: false, reason: "fub_connector_unregistered" };
    }

    const body = [
      result.envelope.brief.headline,
      "",
      result.envelope.brief.body,
      result.envelope.deltas.length === 0 ? "" : "\nWhat changed: " + result.envelope.deltas.join("; "),
      `\nTriggered by: ${params.triggerReason}`,
    ].filter((s) => s.length > 0).join("\n");

    await connector.pushContactNote(params.workspaceId, {
      contactId: fubContactId,
      body,
      attribution,
      occurredAt: null,
      sourceTag: "harwick:brief",
    });

    return { ok: true, pushed: true };
  } catch (error) {
    console.error("[pushLeadBriefAsCrmNote] failed:", error);
    return { ok: false, pushed: false, reason: error instanceof Error ? error.message : "unknown_error" };
  }
}
