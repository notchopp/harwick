import {
  getCrmConnector,
  type AttributionConfig,
  type CrmContactCreate,
} from "@realty-ops/core";

import { pushLeadBriefAsCrmNote } from "./crm-note-push";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * Buyer-chat capture → CRM push. Wires the public-listing-chat lead
 * capture moment to the workspace's connected CRM (FUB today; kvCore
 * + others later) so the lead lands WARM at the moment of capture —
 * not later via batch sync, not invisible until the operator notices.
 *
 * Flow:
 *   1. Check the workspace has a connected CRM integration. If not, no-op.
 *   2. Load the lead. Need at minimum a phone (FUB dedupes on it).
 *   3. If the lead already has a CRM contact id, skip create; just push
 *      the fresh brief as a note.
 *   4. Else: createContact via the connector (FUB returns existing on
 *      phone match via ?dedupe=true). Persist the provider contact id
 *      back onto the lead.
 *   5. Push the chief-of-staff brief as a CRM note via
 *      pushLeadBriefAsCrmNote (the existing briefEntity → connector
 *      pipeline). This is what makes the FUB entry feel like a warm
 *      handoff, not a contact form drop.
 *
 * Best-effort. Failures log + return; never throws into the caller so
 * the buyer's chat experience doesn't break if FUB is down.
 *
 * Strategic: this is the load-bearing wiring for the "Harwick converts
 * social traffic into warm FUB leads" pitch. Before this existed, the
 * buyer-chat capture sat in Supabase and never flowed to FUB unless an
 * operator-side workflow triggered later. Now it flows in real time.
 */

type LeadForCrmPush = {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  follow_up_boss_contact_id: string | null;
  qualification_summary: string | null;
};

function splitFullName(fullName: string | null): { firstName: string | null; lastName: string | null } {
  if (fullName === null) return { firstName: null, lastName: null };
  const trimmed = fullName.trim();
  if (trimmed.length === 0) return { firstName: null, lastName: null };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" "),
  };
}

async function workspaceHasFubConnected(workspaceId: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data } = await untyped
    .from("integration_accounts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider", "follow_up_boss")
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  return data !== null && data !== undefined;
}

async function loadLeadForCrm(workspaceId: string, leadId: string): Promise<LeadForCrmPush | null> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data } = await untyped
    .from("leads")
    .select("id, full_name, phone, email, follow_up_boss_contact_id, qualification_summary")
    .eq("workspace_id", workspaceId)
    .eq("id", leadId)
    .maybeSingle();
  if (data === null || data === undefined) return null;
  return data as LeadForCrmPush;
}

async function persistFubContactId(workspaceId: string, leadId: string, fubContactId: string): Promise<void> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  await untyped
    .from("leads")
    .update({ follow_up_boss_contact_id: fubContactId })
    .eq("workspace_id", workspaceId)
    .eq("id", leadId);
}

async function loadWorkspaceAttribution(workspaceId: string): Promise<AttributionConfig> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data } = await untyped
    .from("workspaces")
    .select("attribution_config")
    .eq("id", workspaceId)
    .maybeSingle();
  return (data?.attribution_config as AttributionConfig | undefined) ?? {
    style: "via_harwick",
    customText: null,
    workspaceLabel: null,
  };
}

export async function pushBuyerChatLeadToCrm(params: {
  workspaceId: string;
  leadId: string;
}): Promise<{ ok: boolean; pushed: boolean; reason?: string; fubContactId?: string }> {
  try {
    if (!(await workspaceHasFubConnected(params.workspaceId))) {
      return { ok: true, pushed: false, reason: "no_fub_integration" };
    }

    const lead = await loadLeadForCrm(params.workspaceId, params.leadId);
    if (lead === null) {
      return { ok: false, pushed: false, reason: "lead_not_found" };
    }
    // FUB dedupes on phone/email. We need at least one.
    if (lead.phone === null && lead.email === null) {
      return { ok: true, pushed: false, reason: "no_dedupe_identifier" };
    }

    let fubContactId = lead.follow_up_boss_contact_id;
    if (fubContactId === null) {
      const connector = getCrmConnector("fub");
      if (connector === null) {
        return { ok: false, pushed: false, reason: "fub_connector_unregistered" };
      }
      const attribution = await loadWorkspaceAttribution(params.workspaceId);
      const names = splitFullName(lead.full_name);
      const createPayload: CrmContactCreate = {
        firstName: names.firstName,
        lastName: names.lastName,
        email: lead.email,
        phone: lead.phone,
        source: "Harwick Public Listing Chat",
        tags: ["harwick", "public_chat"],
        headline: lead.qualification_summary,
      };
      // Avoid unused-var warning while keeping attribution available for
      // future CRM providers that surface source attribution on create.
      void attribution;
      const createResult = await connector.createContact(params.workspaceId, createPayload);
      fubContactId = createResult.providerContactId;
      await persistFubContactId(params.workspaceId, params.leadId, fubContactId);
    }

    const briefResult = await pushLeadBriefAsCrmNote({
      workspaceId: params.workspaceId,
      leadId: params.leadId,
      triggerReason: "buyer_chat_capture",
    });

    return {
      ok: briefResult.ok,
      pushed: briefResult.pushed,
      ...(briefResult.reason === undefined ? {} : { reason: briefResult.reason }),
      fubContactId,
    };
  } catch (error) {
    console.error("[pushBuyerChatLeadToCrm] failed:", error);
    return {
      ok: false,
      pushed: false,
      reason: error instanceof Error ? error.message : "unknown_error",
    };
  }
}
