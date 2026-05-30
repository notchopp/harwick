import {
  ExtractedLeadFieldsSchema,
  normalizePhone,
  parseBudgetRangeText,
  type ExtractedLeadFields,
  type NormalizedLeadEvent,
  type RoutingCalendarStatus,
  type ShowingMode,
} from "@realty-ops/core";
import type {
  HarwickRoutingDecisionInsertRow,
  HarwickRoutingDecisionRow,
  IntegrationAccountRow,
  LeadEventRow,
  MemberRoutingProfileRow,
  WorkspaceMemberRow,
  WorkspaceMemberCalendarConnectionRow,
} from "./database.types";
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
  // Added in the public-listing-chat era — Harwick maintains a per-lead
  // running document (timestamped append-only log of what got captured
  // turn-by-turn) plus a one-sentence qualification summary that the
  // operator drawer surfaces. Optional so older lead-insertion paths
  // (IG/FB/voice flows that don't write these columns) keep typechecking.
  qualification_summary?: string | null;
  lead_document?: string | null;
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

export type LeadQualificationEditableRow = Pick<
  LeadRow,
  | "id"
  | "workspace_id"
  | "assigned_agent_id"
  | "lead_type"
  | "intent"
  | "timeline"
  | "budget_min"
  | "budget_max"
  | "target_area"
  | "financing_status"
>;

export type LeadRoutingActionLeadRow = Pick<
  LeadRow,
  | "id"
  | "workspace_id"
  | "status"
  | "assigned_agent_id"
  | "full_name"
  | "lead_type"
  | "intent"
  | "timeline"
  | "budget_min"
  | "budget_max"
  | "target_area"
  | "financing_status"
  | "score"
>;

export type LeadRoutingActionMemberRow = Pick<
  WorkspaceMemberRow,
  "id" | "display_name" | "role" | "is_active"
>;

export type LeadRoutingActionDecisionRow = Pick<HarwickRoutingDecisionRow, "id">;

export type LeadRoutingCalendarSignal = {
  calendarStatus: RoutingCalendarStatus;
  showingMode: ShowingMode | null;
};

export type LeadUpsertRepository = {
  findExistingLead(lookup: LeadLookup): Promise<Pick<LeadRow, "id"> | null>;
  insertLead(row: LeadInsertRow): Promise<Pick<LeadRow, "id">>;
  updateLead(leadId: string, row: LeadUpdateRow): Promise<Pick<LeadRow, "id">>;
};

export type LeadQualificationRepository = {
  findLeadForQualificationUpdate(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<LeadQualificationEditableRow | null>;
  updateLeadQualification(params: {
    workspaceId: string;
    leadId: string;
    row: LeadUpdateRow;
  }): Promise<Pick<LeadRow, "id">>;
};

export type LeadRoutingActionRepository = {
  findLeadForRoutingAction(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<LeadRoutingActionLeadRow | null>;
  listRoutingProfiles(workspaceId: string): Promise<MemberRoutingProfileRow[]>;
  listActiveWorkspaceMembers(workspaceId: string): Promise<LeadRoutingActionMemberRow[]>;
  listAssignedActiveLeadCounts(workspaceId: string): Promise<Record<string, number>>;
  listCalendarRoutingSignals(workspaceId: string): Promise<Record<string, LeadRoutingCalendarSignal>>;
  findLeadSourceOwnerMemberId(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<string | null>;
  updateLeadAssignment(params: {
    workspaceId: string;
    leadId: string;
    assignedMemberId: string;
  }): Promise<Pick<LeadRow, "id">>;
  insertRoutingDecision(row: HarwickRoutingDecisionInsertRow): Promise<LeadRoutingActionDecisionRow>;
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
      return 0;
    case "unknown":
    case undefined:
      // New leads without extracted intent still need to be visible
      return 50;
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
    phone: normalizePhone(event.phone),
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
    phone: normalizePhone(event.phone),
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
      // Phone-as-canonical-ID: prefer phone match over channel-specific
      // identifiers so a buyer who chats on web and later DMs on IG with
      // the same number resolves to ONE lead, not two. Phone is normalized
      // both at write-time (insert/update) and read-time (here) so the
      // dedupe survives formatting variation.
      const normalizedPhone = normalizePhone(lookup.phone);
      if (normalizedPhone !== null) {
        const { data, error } = await supabase
          .from("leads")
          .select("id")
          .eq("workspace_id", lookup.workspaceId)
          .eq("phone", normalizedPhone)
          .limit(1)
          .maybeSingle<Pick<LeadRow, "id">>();
        if (error !== null) throw error;
        if (data !== null) return data;
      }

      let query = supabase
        .from("leads")
        .select("id")
        .eq("workspace_id", lookup.workspaceId)
        .limit(1);

      if (lookup.instagramUserId !== null) {
        query = query.eq("instagram_user_id", lookup.instagramUserId);
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

export function createSupabaseLeadQualificationRepository(
  supabase: RealtyOpsSupabaseClient,
): LeadQualificationRepository {
  return {
    async findLeadForQualificationUpdate(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, workspace_id, assigned_agent_id, lead_type, intent, timeline, budget_min, budget_max, target_area, financing_status")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .maybeSingle<LeadQualificationEditableRow>();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },

    async updateLeadQualification(params) {
      const { data, error } = await supabase
        .from("leads")
        .update(params.row)
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .select("id")
        .single<Pick<LeadRow, "id">>();

      if (error !== null) {
        throw error;
      }

      return data;
    },
  };
}

export function createSupabaseLeadRoutingActionRepository(
  supabase: RealtyOpsSupabaseClient,
): LeadRoutingActionRepository {
  return {
    async findLeadForRoutingAction(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, workspace_id, status, assigned_agent_id, full_name, lead_type, intent, timeline, budget_min, budget_max, target_area, financing_status, score")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .maybeSingle<LeadRoutingActionLeadRow>();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },

    async listRoutingProfiles(workspaceId) {
      const { data, error } = await supabase
        .from("member_routing_profiles")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .returns<MemberRoutingProfileRow[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async listActiveWorkspaceMembers(workspaceId) {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("id, display_name, role, is_active")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .returns<LeadRoutingActionMemberRow[]>();

      if (error !== null) {
        throw error;
      }

      return data ?? [];
    },

    async listAssignedActiveLeadCounts(workspaceId) {
      const { data, error } = await supabase
        .from("leads")
        .select("assigned_agent_id, status")
        .eq("workspace_id", workspaceId)
        .not("assigned_agent_id", "is", null)
        .not("status", "in", "(closed_won,closed_lost,archived)")
        .returns<Array<Pick<LeadRow, "assigned_agent_id" | "status">>>();

      if (error !== null) {
        throw error;
      }

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        if (row.assigned_agent_id !== null) {
          counts[row.assigned_agent_id] = (counts[row.assigned_agent_id] ?? 0) + 1;
        }
      }

      return counts;
    },

    async listCalendarRoutingSignals(workspaceId) {
      const { data, error } = await supabase
        .from("workspace_member_calendar_connections")
        .select("member_id, showing_mode")
        .eq("workspace_id", workspaceId)
        .eq("provider", "google")
        .eq("status", "connected")
        .returns<Array<Pick<WorkspaceMemberCalendarConnectionRow, "member_id" | "showing_mode">>>();

      if (error !== null) {
        throw error;
      }

      const signals: Record<string, LeadRoutingCalendarSignal> = {};
      for (const row of data ?? []) {
        const showingMode = row.showing_mode === "collect_only"
          || row.showing_mode === "request_approve"
          || row.showing_mode === "auto_book"
          ? row.showing_mode
          : null;
        signals[row.member_id] = {
          calendarStatus: "connected",
          showingMode,
        };
      }

      return signals;
    },

    async findLeadSourceOwnerMemberId(params) {
      const { data: event, error: eventError } = await supabase
        .from("lead_events")
        .select("provider, provider_account_id")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .not("provider_account_id", "is", null)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle<Pick<LeadEventRow, "provider" | "provider_account_id">>();

      if (eventError !== null) {
        throw eventError;
      }
      if (event?.provider_account_id === null || event?.provider_account_id === undefined) {
        return null;
      }

      const { data, error } = await supabase
        .from("integration_accounts")
        .select("owner_member_id")
        .eq("workspace_id", params.workspaceId)
        .eq("provider", event.provider)
        .eq("provider_account_id", event.provider_account_id)
        .eq("status", "connected")
        .maybeSingle<Pick<IntegrationAccountRow, "owner_member_id">>();

      if (error !== null) {
        throw error;
      }
      if (data?.owner_member_id !== undefined) {
        return data.owner_member_id;
      }

      const { data: aliasData, error: aliasError } = await supabase
        .from("integration_accounts")
        .select("owner_member_id")
        .eq("workspace_id", params.workspaceId)
        .eq("provider", event.provider)
        .contains("provider_account_ids", [event.provider_account_id])
        .eq("status", "connected")
        .maybeSingle<Pick<IntegrationAccountRow, "owner_member_id">>();

      if (aliasError !== null) {
        throw aliasError;
      }

      return aliasData?.owner_member_id ?? null;
    },

    async updateLeadAssignment(params) {
      const { data, error } = await supabase
        .from("leads")
        .update({
          assigned_agent_id: params.assignedMemberId,
          status: "assigned",
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .select("id")
        .single<Pick<LeadRow, "id">>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    async insertRoutingDecision(row) {
      const { data, error } = await supabase
        .from("harwick_routing_decisions")
        .insert(row)
        .select("id")
        .single<LeadRoutingActionDecisionRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    },
  };
}

type RoutingDecisionUndoLookupRow = Pick<
  HarwickRoutingDecisionRow,
  "lead_id" | "final_member_id" | "decided_at" | "evidence" | "reason"
>;

function readPreviousAssignedFromEvidence(evidence: unknown): string | null {
  if (evidence === null || typeof evidence !== "object" || Array.isArray(evidence)) {
    return null;
  }
  const value = (evidence as Record<string, unknown>)["previousAssignedMemberId"];
  return typeof value === "string" ? value : null;
}

export function createSupabaseLeadRoutingUndoRepository(supabase: RealtyOpsSupabaseClient) {
  return {
    async findRoutingDecisionForUndo(params: { workspaceId: string; routingDecisionId: string }) {
      const { data, error } = await supabase
        .from("harwick_routing_decisions")
        .select("lead_id,final_member_id,decided_at,evidence,reason")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.routingDecisionId)
        .maybeSingle<RoutingDecisionUndoLookupRow>();
      if (error !== null) {
        throw error;
      }
      if (data === null) {
        return null;
      }
      return {
        workspaceId: params.workspaceId,
        leadId: data.lead_id,
        finalMemberId: data.final_member_id,
        decidedAt: data.decided_at,
        previousAssignedMemberId: readPreviousAssignedFromEvidence(data.evidence),
        reason: data.reason,
      };
    },

    async setLeadAssignment(params: { workspaceId: string; leadId: string; assignedMemberId: string | null }) {
      const { error } = await supabase
        .from("leads")
        .update({
          assigned_agent_id: params.assignedMemberId,
          status: params.assignedMemberId === null ? "new" : "assigned",
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId);
      if (error !== null) {
        throw error;
      }
    },

    async insertReversalDecision(params: {
      workspaceId: string;
      leadId: string;
      originalDecisionId: string;
      revertedFromMemberId: string | null;
      restoredAssignedMemberId: string | null;
      actorMemberId: string;
      nowIso: string;
      reason: string;
    }) {
      const { data, error } = await supabase
        .from("harwick_routing_decisions")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          trajectory_id: null,
          step_id: null,
          suggested_member_id: params.restoredAssignedMemberId,
          final_member_id: params.restoredAssignedMemberId,
          status: "overridden",
          confidence: null,
          reason: params.reason,
          evidence: {
            mode: "undo",
            originalDecisionId: params.originalDecisionId,
            revertedFromMemberId: params.revertedFromMemberId,
            restoredAssignedMemberId: params.restoredAssignedMemberId,
          },
          created_by_actor_type: "member",
          decided_by_member_id: params.actorMemberId,
          decided_at: params.nowIso,
          override_reason: `undo:${params.originalDecisionId}`,
          updated_at: params.nowIso,
        })
        .select("id")
        .single<LeadRoutingActionDecisionRow>();
      if (error !== null) {
        throw error;
      }
      return { id: data.id };
    },
  };
}
