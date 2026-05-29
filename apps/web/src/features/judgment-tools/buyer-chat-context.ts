import { getCrmConnector } from "@realty-ops/core";

import { runJudgmentDefault } from "./supabase-cache";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * Buyer-returning flow — when a returning buyer hits the public-listing chat
 * and resolves to an existing lead, this builds the system-prompt augmentation
 * via briefEntity(audience: buyer, destination: chat_context).
 *
 * The brief filters internal notes from buyer-surfacable context. So the
 * chat LLM gets:
 *   "Since their last chat 3 days ago: Tiana confirmed Saturday 2pm showing
 *   and got back the garage specs. Lender intro is queued for tomorrow.
 *   Buyer previously asked about media room and group capacity. Don't
 *   surface: internal note from Tiana flagging buyer-seems-flaky."
 *
 * The buyer then asks "what's up with the garage?" and Harwick responds with
 * the CRM-current answer, not a generic "let me check."
 */

export async function buildBuyerChatContext(params: {
  workspaceId: string;
  leadId: string;
}): Promise<{ contextBrief: string; deltas: string[] } | null> {
  try {
    const supabase = createServerSupabaseClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const untyped = supabase as any;

    const { data: lead } = await untyped
      .from("leads")
      .select("id, full_name, phone, follow_up_boss_contact_id, qualification_summary, lead_document, status, lead_type, intent, score, target_area, timeline, financing_status, assigned_agent_id, created_at, updated_at")
      .eq("id", params.leadId)
      .eq("workspace_id", params.workspaceId)
      .maybeSingle();
    if (lead === null || lead === undefined) return null;

    const [tasksResult, eventsResult] = await Promise.all([
      untyped
        .from("lead_tasks")
        .select("task_type, status, title, description, due_at, requested_start_at")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .order("created_at", { ascending: false })
        .limit(10),
      untyped
        .from("lead_events")
        .select("event_type, source_channel, text, occurred_at")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .order("occurred_at", { ascending: false })
        .limit(10),
    ]);

    // Pull fresh CRM state when a connector is configured for the workspace.
    // For now FUB only; kvCore lookup will plug in once workspaces have
    // kvCore integration credentials configured.
    let crmState: Record<string, unknown> | null = null;
    const fubContactId = lead.follow_up_boss_contact_id as string | null;
    if (fubContactId !== null) {
      try {
        const fub = getCrmConnector("fub");
        if (fub !== null) {
          crmState = await fub.fetchContact(params.workspaceId, fubContactId) as unknown as Record<string, unknown>;
        }
      } catch (error) {
        console.warn("[buyer-chat-context] CRM fetch failed (continuing without):", error);
      }
    }

    const result = await runJudgmentDefault({
      workspaceId: params.workspaceId,
      tool: "briefEntity",
      audience: {
        role: "buyer",
        memberId: null,
        voicePersona: null,
        scope: "personal",
      },
      destination: "chat_context",
      input: {
        type: "lead",
        id: params.leadId,
        entityState: lead as Record<string, unknown>,
        relatedTasks: (tasksResult.data ?? []) as Array<Record<string, unknown>>,
        recentEvents: (eventsResult.data ?? []) as Array<Record<string, unknown>>,
        crmState,
        channelAvailability: {
          instagram: false,
          facebook: false,
          sms: false,
          voice: false,
          public_chat: true,
        },
      },
      forceRegen: true,
    });

    if (result.envelope.confidence < 0.5) return null;

    return {
      contextBrief: [
        result.envelope.brief.headline,
        result.envelope.brief.body,
      ].join("\n\n"),
      deltas: result.envelope.deltas,
    };
  } catch (error) {
    console.error("[buildBuyerChatContext] failed:", error);
    return null;
  }
}
