import {
  ExtractedLeadFieldsSchema,
  parseBudgetRangeText,
  type ExtractedLeadFields,
  type NormalizedLeadEvent,
} from "@realty-ops/core";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type LeadRow = {
  id: string;
  workspace_id: string;
  status: "new" | "engaged" | "qualified" | "hot" | "assigned" | "nurture" | "appointment_booked" | "active_client" | "closed_won" | "closed_lost" | "archived";
  source_channel: NormalizedLeadEvent["sourceChannel"];
  source_provider_id: string | null;
  source_post_id: string | null;
  source_comment_id: string | null;
  instagram_user_id: string | null;
  instagram_username: string | null;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  lead_type: "buyer" | "seller" | "renter" | "investor" | "unknown";
  intent: "high" | "medium" | "low" | "spam" | "unknown";
  timeline: string | null;
  budget_min: number | null;
  budget_max: number | null;
  target_area: string | null;
  financing_status: "preapproved" | "cash" | "needs_lender" | "unknown";
  score: number;
  assigned_agent_id: string | null;
  follow_up_boss_contact_id: string | null;
  last_message_at: string | null;
  next_followup_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadInsertRow = Omit<LeadRow, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type LeadUpdateRow = Partial<Omit<LeadRow, "id" | "workspace_id" | "created_at">>;

export type LeadLookup = {
  workspaceId: string;
  instagramUserId: string | null;
  sourceProviderId: string | null;
  phone: string | null;
  email: string | null;
};

export type LeadUpsertResult = {
  leadId: string;
  created: boolean;
};

export type LeadUpsertRepository = {
  findExistingLead(lookup: LeadLookup): Promise<Pick<LeadRow, "id"> | null>;
  insertLead(row: LeadInsertRow): Promise<Pick<LeadRow, "id">>;
  updateLead(leadId: string, row: LeadUpdateRow): Promise<Pick<LeadRow, "id">>;
};

export function buildLeadLookupFromEvent(event: NormalizedLeadEvent): LeadLookup {
  return {
    workspaceId: event.workspaceId,
    instagramUserId: event.provider === "meta" ? event.providerUserId : null,
    sourceProviderId: event.providerUserId,
    phone: event.phone,
    email: null,
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function readExtractedLeadFields(event: NormalizedLeadEvent): ExtractedLeadFields | null {
  const rawPayload = readRecord(event.rawPayload);
  const extractedLead = rawPayload === null ? null : rawPayload["extractedLead"];
  const parsed = ExtractedLeadFieldsSchema.safeParse(extractedLead);

  return parsed.success ? parsed.data : null;
}

function scoreFromExtractedLead(extractedLead: ExtractedLeadFields | null): number {
  switch (extractedLead?.intent) {
    case "high":
      return 80;
    case "medium":
      return 55;
    case "low":
      return 25;
    case "spam":
    case "unknown":
    case undefined:
      return 0;
  }
}

function statusFromExtractedLead(extractedLead: ExtractedLeadFields | null): LeadRow["status"] {
  switch (extractedLead?.intent) {
    case "high":
      return "hot";
    case "medium":
      return "qualified";
    case "low":
      return "engaged";
    case "spam":
      return "archived";
    case "unknown":
    case undefined:
      return "new";
  }
}

export function mapInboundEventToLeadInsertRow(event: NormalizedLeadEvent): LeadInsertRow {
  const extractedLead = readExtractedLeadFields(event);
  const budgetRange = parseBudgetRangeText(extractedLead?.budget);

  return {
    workspace_id: event.workspaceId,
    status: statusFromExtractedLead(extractedLead),
    source_channel: event.sourceChannel,
    source_provider_id: event.providerUserId,
    source_post_id: event.sourcePostId,
    source_comment_id: event.sourceCommentId,
    instagram_user_id: event.provider === "meta" ? event.providerUserId : null,
    instagram_username: event.instagramUsername,
    full_name: extractedLead?.callerName ?? event.instagramUsername,
    phone: event.phone,
    email: null,
    lead_type: extractedLead?.leadType ?? "unknown",
    intent: extractedLead?.intent ?? "unknown",
    timeline: extractedLead?.timeline ?? null,
    budget_min: budgetRange.min,
    budget_max: budgetRange.max,
    target_area: extractedLead?.targetArea ?? null,
    financing_status: extractedLead?.financingStatus ?? "unknown",
    score: scoreFromExtractedLead(extractedLead),
    assigned_agent_id: null,
    follow_up_boss_contact_id: null,
    last_message_at: event.occurredAt,
    next_followup_at: null,
  };
}

export function mapInboundEventToLeadUpdateRow(event: NormalizedLeadEvent): LeadUpdateRow {
  const extractedLead = readExtractedLeadFields(event);
  const budgetRange = parseBudgetRangeText(extractedLead?.budget);
  const row: LeadUpdateRow = {
    source_channel: event.sourceChannel,
    source_provider_id: event.providerUserId,
    source_post_id: event.sourcePostId,
    source_comment_id: event.sourceCommentId,
    instagram_user_id: event.provider === "meta" ? event.providerUserId : null,
    instagram_username: event.instagramUsername,
    phone: event.phone,
    last_message_at: event.occurredAt,
    updated_at: event.occurredAt,
  };

  if (extractedLead === null) {
    return row;
  }

  if (extractedLead.callerName !== null) {
    row.full_name = extractedLead.callerName;
  }
  if (extractedLead.leadType !== "unknown") {
    row.lead_type = extractedLead.leadType;
  }
  if (extractedLead.intent !== "unknown") {
    row.intent = extractedLead.intent;
    row.status = statusFromExtractedLead(extractedLead);
    row.score = scoreFromExtractedLead(extractedLead);
  }
  if (extractedLead.timeline !== null) {
    row.timeline = extractedLead.timeline;
  }
  if (budgetRange.min !== null || budgetRange.max !== null) {
    row.budget_min = budgetRange.min;
    row.budget_max = budgetRange.max;
  }
  if (extractedLead.targetArea !== null) {
    row.target_area = extractedLead.targetArea;
  }
  if (extractedLead.financingStatus !== "unknown") {
    row.financing_status = extractedLead.financingStatus;
  }

  return row;
}

export async function upsertLeadFromInboundEvent(params: {
  event: NormalizedLeadEvent;
  repository: LeadUpsertRepository;
}): Promise<LeadUpsertResult> {
  const existingLead = await params.repository.findExistingLead(buildLeadLookupFromEvent(params.event));

  if (existingLead !== null) {
    const updatedLead = await params.repository.updateLead(
      existingLead.id,
      mapInboundEventToLeadUpdateRow(params.event),
    );

    return {
      leadId: updatedLead.id,
      created: false,
    };
  }

  const insertedLead = await params.repository.insertLead(
    mapInboundEventToLeadInsertRow(params.event),
  );

  return {
    leadId: insertedLead.id,
    created: true,
  };
}

export function createSupabaseLeadUpsertRepository(
  supabase: RealtyOpsSupabaseClient,
): LeadUpsertRepository {
  return {
    async findExistingLead(lookup) {
      let query = supabase
        .from("leads")
        .select("id")
        .eq("workspace_id", lookup.workspaceId)
        .limit(1);

      if (lookup.instagramUserId !== null) {
        query = query.eq("instagram_user_id", lookup.instagramUserId);
      } else if (lookup.phone !== null) {
        query = query.eq("phone", lookup.phone);
      } else if (lookup.email !== null) {
        query = query.eq("email", lookup.email);
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
  };
}
