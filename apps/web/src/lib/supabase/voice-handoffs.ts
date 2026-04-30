import {
  normalizeFreeformText,
  parseBudgetRangeText,
  normalizeUsPhoneNumber,
  type CreateLeadHandoffArgs,
} from "@realty-ops/core";
import type { LeadInsertRow, LeadLookup, LeadRow, LeadUpdateRow, LeadUpsertRepository } from "./leads";
import type { RealtyOpsSupabaseClient } from "./server-client";
import type { WorkflowJobEnqueuer } from "./workflow-jobs";

export type VoiceLeadHandoffRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  call_id: string | null;
  retell_agent_id: string | null;
  phone: string | null;
  caller_name: string | null;
  lead_type: CreateLeadHandoffArgs["lead_type"];
  target_area: string | null;
  timeline: string | null;
  budget: string | null;
  financing_status: CreateLeadHandoffArgs["financing_status"];
  urgency: CreateLeadHandoffArgs["urgency"];
  summary: string;
  status: "captured" | "queued" | "synced" | "failed";
  review_status: "pending" | "callback_created" | "reviewed" | "dismissed";
  reviewed_by_member_id: string | null;
  reviewed_at: string | null;
  callback_task_id: string | null;
  dismissal_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type VoiceLeadHandoffInsertRow = Omit<VoiceLeadHandoffRow, "id" | "review_status" | "reviewed_by_member_id" | "reviewed_at" | "callback_task_id" | "dismissal_reason" | "created_at" | "updated_at"> & {
  id?: string;
  review_status?: VoiceLeadHandoffRow["review_status"];
  reviewed_by_member_id?: string | null;
  reviewed_at?: string | null;
  callback_task_id?: string | null;
  dismissal_reason?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type VoiceLeadHandoffInput = {
  workspaceId: string;
  callId: string | null;
  retellAgentId: string | null;
  fallbackPhone: string | null;
  args: CreateLeadHandoffArgs;
  occurredAt?: string;
};

export type VoiceLeadHandoffResult = {
  leadId: string;
  handoffId: string;
  createdLead: boolean;
};

export type VoiceLeadHandoffRepository = LeadUpsertRepository & {
  insertVoiceLeadHandoff(row: VoiceLeadHandoffInsertRow): Promise<Pick<VoiceLeadHandoffRow, "id">>;
};

function emptyToNull(value: string | undefined): string | null {
  return normalizeFreeformText(value) ?? null;
}

function scoreVoiceHandoff(args: CreateLeadHandoffArgs): number {
  if (args.urgency === "hot") {
    return 85;
  }
  if (args.urgency === "needs_handoff") {
    return 75;
  }
  return 45;
}

function intentFromVoiceHandoff(args: CreateLeadHandoffArgs): LeadRow["intent"] {
  if (args.urgency === "hot" || args.urgency === "needs_handoff") {
    return "high";
  }
  return "medium";
}

function statusFromVoiceHandoff(args: CreateLeadHandoffArgs): LeadRow["status"] {
  if (args.urgency === "hot") {
    return "hot";
  }
  if (args.urgency === "needs_handoff") {
    return "qualified";
  }
  return "new";
}

export function buildVoiceLeadLookup(input: VoiceLeadHandoffInput): LeadLookup {
  const phone = normalizeUsPhoneNumber(input.args.phone_number ?? input.fallbackPhone);

  return {
    workspaceId: input.workspaceId,
    instagramUserId: null,
    sourceProviderId: phone ?? input.callId,
    phone,
    email: null,
  };
}

export function mapVoiceHandoffToLeadInsertRow(input: VoiceLeadHandoffInput): LeadInsertRow {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const phone = normalizeUsPhoneNumber(input.args.phone_number ?? input.fallbackPhone);
  const budgetRange = parseBudgetRangeText(input.args.budget);

  return {
    workspace_id: input.workspaceId,
    status: statusFromVoiceHandoff(input.args),
    source_channel: "call",
    source_provider_id: phone ?? input.callId,
    source_post_id: null,
    source_comment_id: null,
    instagram_user_id: null,
    instagram_username: null,
    full_name: emptyToNull(input.args.caller_name),
    phone,
    email: null,
    lead_type: input.args.lead_type,
    intent: intentFromVoiceHandoff(input.args),
    timeline: emptyToNull(input.args.timeline),
    budget_min: budgetRange.min,
    budget_max: budgetRange.max,
    target_area: emptyToNull(input.args.target_area),
    financing_status: input.args.financing_status,
    score: scoreVoiceHandoff(input.args),
    assigned_agent_id: null,
    follow_up_boss_contact_id: null,
    last_message_at: occurredAt,
    next_followup_at: null,
  };
}

export function mapVoiceHandoffToLeadUpdateRow(input: VoiceLeadHandoffInput): LeadUpdateRow {
  const insertRow = mapVoiceHandoffToLeadInsertRow(input);

  const updateRow: LeadUpdateRow = {
    status: insertRow.status,
    source_channel: insertRow.source_channel,
    source_provider_id: insertRow.source_provider_id,
    full_name: insertRow.full_name,
    phone: insertRow.phone,
    lead_type: insertRow.lead_type,
    intent: insertRow.intent,
    timeline: insertRow.timeline,
    budget_min: insertRow.budget_min,
    budget_max: insertRow.budget_max,
    target_area: insertRow.target_area,
    financing_status: insertRow.financing_status,
    score: insertRow.score,
    last_message_at: insertRow.last_message_at,
  };

  if (insertRow.last_message_at !== null) {
    updateRow.updated_at = insertRow.last_message_at;
  }

  return updateRow;
}

export function mapVoiceHandoffToInsertRow(
  input: VoiceLeadHandoffInput,
  leadId: string,
): VoiceLeadHandoffInsertRow {
  return {
    workspace_id: input.workspaceId,
    lead_id: leadId,
    call_id: input.callId,
    retell_agent_id: input.retellAgentId,
    phone: normalizeUsPhoneNumber(input.args.phone_number ?? input.fallbackPhone),
    caller_name: emptyToNull(input.args.caller_name),
    lead_type: input.args.lead_type,
    target_area: emptyToNull(input.args.target_area),
    timeline: emptyToNull(input.args.timeline),
    budget: emptyToNull(input.args.budget),
    financing_status: input.args.financing_status,
    urgency: input.args.urgency,
    summary: input.args.summary,
    status: "captured",
  };
}

export async function persistVoiceLeadHandoff(params: {
  input: VoiceLeadHandoffInput;
  repository: VoiceLeadHandoffRepository;
  enqueueWorkflowJob?: WorkflowJobEnqueuer;
}): Promise<VoiceLeadHandoffResult> {
  const lookup = buildVoiceLeadLookup(params.input);
  const existingLead = await params.repository.findExistingLead(lookup);
  const leadResult = existingLead === null
    ? {
        lead: await params.repository.insertLead(mapVoiceHandoffToLeadInsertRow(params.input)),
        created: true,
      }
    : {
        lead: await params.repository.updateLead(
          existingLead.id,
          mapVoiceHandoffToLeadUpdateRow(params.input),
        ),
        created: false,
      };

  const handoff = await params.repository.insertVoiceLeadHandoff(
    mapVoiceHandoffToInsertRow(params.input, leadResult.lead.id),
  );
  if (params.enqueueWorkflowJob !== undefined) {
    await params.enqueueWorkflowJob({
      workspaceId: params.input.workspaceId,
      leadId: leadResult.lead.id,
      leadEventId: null,
      jobType: "lead_qualification",
      idempotencyKey: `voice_handoff_qualification:${handoff.id}`,
      payload: {
        jobType: "lead_qualification",
        workspaceId: params.input.workspaceId,
        leadId: leadResult.lead.id,
        reason: "manual_review",
      },
    });
  }

  return {
    leadId: leadResult.lead.id,
    handoffId: handoff.id,
    createdLead: leadResult.created,
  };
}

export function createSupabaseVoiceLeadHandoffRepository(
  supabase: RealtyOpsSupabaseClient,
): VoiceLeadHandoffRepository {
  return {
    async findExistingLead(lookup) {
      let query = supabase
        .from("leads")
        .select("id")
        .eq("workspace_id", lookup.workspaceId)
        .limit(1);

      if (lookup.phone !== null) {
        query = query.eq("phone", lookup.phone);
      } else if (lookup.sourceProviderId !== null) {
        query = query.eq("source_provider_id", lookup.sourceProviderId);
      } else {
        return null;
      }

      const { data, error } = await query.maybeSingle<Pick<LeadRow, "id">>();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },

    async insertLead(row) {
      const { data, error } = await supabase
        .from("leads")
        .insert(row)
        .select("id")
        .single<Pick<LeadRow, "id">>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    async updateLead(leadId, row) {
      const { data, error } = await supabase
        .from("leads")
        .update(row)
        .eq("id", leadId)
        .select("id")
        .single<Pick<LeadRow, "id">>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    async insertVoiceLeadHandoff(row) {
      const { data, error } = await supabase
        .from("voice_lead_handoffs")
        .insert(row)
        .select("id")
        .single<Pick<VoiceLeadHandoffRow, "id">>();

      if (error !== null) {
        throw error;
      }

      return data;
    },
  };
}
