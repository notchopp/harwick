import {
  WorkspaceMemoryDocumentSchema,
  WorkspaceMemoryDocumentCreateSchema,
  type WorkspaceMemoryDocument,
  type WorkspaceMemoryDocumentCreate,
  type WorkspaceMemoryReviewStatus,
} from "@realty-ops/core";
import type {
  WorkspaceMemoryDocumentInsertRow,
  WorkspaceMemoryDocumentRow,
  WorkspaceMemoryDocumentUpdateRow,
  Json,
} from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type WorkspaceMemoryRoutingOverrideSignal = {
  workspaceId: string;
  outcomeCount: number;
  latestObservedAt: string;
  operatorMemberIds: string[];
  aiSuggestedMemberIds: string[];
};

export type WorkspaceMemoryOperatorFeedbackSignal = {
  workspaceId: string;
  signalType: "operator_tag_positive" | "operator_tag_negative" | "operator_tag_note";
  feedbackLabel: string | null;
  feedbackSource: string | null;
  outcomeCount: number;
  latestObservedAt: string;
  memberIds: string[];
};

export type WorkspaceMemoryLeadOutcomeSignal = {
  workspaceId: string;
  signalType: "conversion_pattern" | "qualification_pattern" | "churn_pattern";
  sourceChannel: string;
  leadType: string;
  targetArea: string | null;
  outcomeCount: number;
  latestObservedAt: string;
  finalStatuses: string[];
  averageScore: number | null;
};

export type WorkspaceMemoryMarketSignal = {
  workspaceId: string;
  targetArea: string;
  leadType: string;
  outcomeCount: number;
  latestObservedAt: string;
  sourceChannels: string[];
  timelines: string[];
  budgetMin: number | null;
  budgetMax: number | null;
};

export type WorkspaceMemorySourceChannelSignal = {
  workspaceId: string;
  sourceChannel: string;
  leadType: string;
  outcomeCount: number;
  qualifiedCount: number;
  convertedCount: number;
  churnedCount: number;
  latestObservedAt: string;
};

export type WorkspaceMemoryObjectionSignal = {
  workspaceId: string;
  objectionType: "financing" | "price" | "timeline" | "location" | "availability" | "decision_partner";
  outcomeCount: number;
  latestObservedAt: string;
  sourceChannels: string[];
  examples: string[];
};

export type WorkspaceMemoryRuntimeDocument = {
  id: string;
  memoryType: string;
  title: string;
  body: string;
  confidence: number;
  lastObservedAt: string | null;
  similarity?: number;
};

export type WorkspaceMemoryRepository = {
  insertMemoryDocument(input: WorkspaceMemoryDocumentCreate): Promise<{ memoryId: string }>;
  findRecentMemoryByTitle(params: {
    workspaceId: string;
    title: string;
    sinceIso: string;
  }): Promise<{ id: string } | null>;
  listRuntimeMemoryDocuments(params: {
    workspaceId: string;
    limit: number;
  }): Promise<WorkspaceMemoryRuntimeDocument[]>;
  listReviewableMemoryDocuments(params: {
    workspaceId: string;
    limit: number;
    reviewStatus?: WorkspaceMemoryReviewStatus;
  }): Promise<WorkspaceMemoryDocument[]>;
  updateMemoryReview(params: {
    workspaceId: string;
    memoryId: string;
    reviewStatus: WorkspaceMemoryReviewStatus;
    reviewedByMemberId: string;
    reviewedAt: string;
    reviewNote: string | null;
  }): Promise<WorkspaceMemoryDocument>;
  semanticMemorySearch(params: {
    workspaceId: string;
    embedding: number[];
    limit?: number;
    minSimilarity?: number;
  }): Promise<WorkspaceMemoryRuntimeDocument[]>;
  saveMemoryEmbedding(params: {
    workspaceId: string;
    memoryId: string;
    embedding: number[];
    embeddingText: string;
  }): Promise<void>;
  listRoutingOverrideSignals(params: {
    sinceIso: string;
    minCount: number;
    limit: number;
  }): Promise<WorkspaceMemoryRoutingOverrideSignal[]>;
  listOperatorFeedbackSignals(params: {
    sinceIso: string;
    minCount: number;
    limit: number;
  }): Promise<WorkspaceMemoryOperatorFeedbackSignal[]>;
  listLeadOutcomeSignals(params: {
    sinceIso: string;
    minCount: number;
    limit: number;
  }): Promise<WorkspaceMemoryLeadOutcomeSignal[]>;
  listMarketSignals(params: {
    sinceIso: string;
    minCount: number;
    limit: number;
  }): Promise<WorkspaceMemoryMarketSignal[]>;
  listSourceChannelSignals(params: {
    sinceIso: string;
    minCount: number;
    limit: number;
  }): Promise<WorkspaceMemorySourceChannelSignal[]>;
  listObjectionSignals(params: {
    sinceIso: string;
    minCount: number;
    limit: number;
  }): Promise<WorkspaceMemoryObjectionSignal[]>;
};

type IdRow = {
  id: string;
};

type RoutingOverrideOutcomeRow = {
  workspace_id: string;
  recorded_at: string;
  signal_value: Record<string, unknown> | null;
};

type OperatorFeedbackOutcomeRow = {
  workspace_id: string;
  recorded_at: string;
  signal_type: "operator_tag_positive" | "operator_tag_negative" | "operator_tag_note";
  signal_value: Record<string, unknown> | null;
};

type LeadMemorySignalRow = {
  workspace_id: string;
  status: string;
  source_channel: string;
  lead_type: string;
  target_area: string | null;
  timeline: string | null;
  budget_min: number | null;
  budget_max: number | null;
  score: number;
  updated_at: string;
};

type ConversationMessageMemorySignalRow = {
  workspace_id: string;
  body: string;
  source_channel: string | null;
  created_at: string | null;
};

type RuntimeMemoryDocumentRow = {
  id: string;
  memory_type: string;
  title: string;
  body: string;
  confidence: number;
  last_observed_at: string | null;
  similarity?: number;
};

export type ReviewableMemoryDocumentRow = Pick<
  WorkspaceMemoryDocumentRow,
  | "id"
  | "workspace_id"
  | "memory_type"
  | "title"
  | "body"
  | "source"
  | "confidence"
  | "evidence"
  | "last_observed_at"
  | "review_status"
  | "reviewed_by_member_id"
  | "reviewed_at"
  | "review_note"
  | "created_at"
  | "updated_at"
>;

const REVIEWABLE_MEMORY_SELECT = [
  "id",
  "workspace_id",
  "memory_type",
  "title",
  "body",
  "source",
  "confidence",
  "evidence",
  "last_observed_at",
  "review_status",
  "reviewed_by_member_id",
  "reviewed_at",
  "review_note",
  "created_at",
  "updated_at",
].join(", ");

function mapCreateToInsertRow(input: WorkspaceMemoryDocumentCreate): WorkspaceMemoryDocumentInsertRow {
  const parsed = WorkspaceMemoryDocumentCreateSchema.parse(input);
  return {
    workspace_id: parsed.workspaceId,
    memory_type: parsed.memoryType,
    title: parsed.title,
    body: parsed.body,
    source: parsed.source,
    confidence: parsed.confidence,
    evidence: parsed.evidence as Json,
    last_observed_at: parsed.lastObservedAt,
  };
}

function normalizeEvidence(value: Json): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  return {};
}

export function mapReviewableMemoryDocumentRow(row: ReviewableMemoryDocumentRow): WorkspaceMemoryDocument {
  return WorkspaceMemoryDocumentSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    memoryType: row.memory_type,
    title: row.title,
    body: row.body,
    source: row.source,
    confidence: row.confidence,
    evidence: normalizeEvidence(row.evidence),
    lastObservedAt: row.last_observed_at,
    reviewStatus: row.review_status,
    reviewedByMemberId: row.reviewed_by_member_id,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizeGroupText(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed;
}

function readOutcomeSignalType(status: string): WorkspaceMemoryLeadOutcomeSignal["signalType"] | null {
  if (status === "closed_won" || status === "active_client") {
    return "conversion_pattern";
  }
  if (status === "qualified" || status === "hot") {
    return "qualification_pattern";
  }
  if (status === "closed_lost" || status === "archived") {
    return "churn_pattern";
  }
  return null;
}

function detectObjectionType(body: string): WorkspaceMemoryObjectionSignal["objectionType"] | null {
  const text = body.toLowerCase();
  if (/\b(preapproved|pre-approved|lender|loan|mortgage|cash|credit|financ|down payment)\b/.test(text)) {
    return "financing";
  }
  if (/\b(expensive|price|budget|afford|cheaper|payment|too much)\b/.test(text)) {
    return "price";
  }
  if (/\b(not ready|later|next year|lease|waiting|timing|few months|in months)\b/.test(text)) {
    return "timeline";
  }
  if (/\b(commute|school district|neighborhood|area|location)\b/.test(text)) {
    return "location";
  }
  if (/\b(available|still available|sold|showing|tour|open house|schedule)\b/.test(text)) {
    return "availability";
  }
  if (/\b(partner|spouse|husband|wife|family|talk to|discuss)\b/.test(text)) {
    return "decision_partner";
  }
  return null;
}

export function createSupabaseWorkspaceMemoryRepository(
  supabase: RealtyOpsSupabaseClient,
): WorkspaceMemoryRepository {
  return {
    async insertMemoryDocument(input) {
      const { data, error } = await supabase
        .from("workspace_memory_documents")
        .insert(mapCreateToInsertRow(input))
        .select("id")
        .single<IdRow>();

      if (error !== null) {
        throw error;
      }

      return { memoryId: data.id };
    },

    async findRecentMemoryByTitle(params) {
      const { data, error } = await supabase
        .from("workspace_memory_documents")
        .select("id")
        .eq("workspace_id", params.workspaceId)
        .eq("title", params.title)
        .gte("updated_at", params.sinceIso)
        .limit(1)
        .maybeSingle<IdRow>();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },

    async listRuntimeMemoryDocuments(params) {
      const { data, error } = await supabase
        .from("workspace_memory_documents")
        .select("id, memory_type, title, body, confidence, last_observed_at")
        .eq("workspace_id", params.workspaceId)
        .neq("review_status", "dismissed")
        .order("last_observed_at", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(params.limit)
        .returns<RuntimeMemoryDocumentRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map((row) => ({
        id: row.id,
        memoryType: row.memory_type,
        title: row.title,
        body: row.body,
        confidence: row.confidence,
        lastObservedAt: row.last_observed_at,
      }));
    },

    async listReviewableMemoryDocuments(params) {
      let query = supabase
        .from("workspace_memory_documents")
        .select(REVIEWABLE_MEMORY_SELECT)
        .eq("workspace_id", params.workspaceId)
        .order("updated_at", { ascending: false })
        .limit(params.limit);

      if (params.reviewStatus !== undefined) {
        query = query.eq("review_status", params.reviewStatus);
      }

      const { data, error } = await query.returns<ReviewableMemoryDocumentRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapReviewableMemoryDocumentRow);
    },

    async updateMemoryReview(params) {
      const row: WorkspaceMemoryDocumentUpdateRow = {
        review_status: params.reviewStatus,
        reviewed_by_member_id: params.reviewStatus === "pending" ? null : params.reviewedByMemberId,
        reviewed_at: params.reviewStatus === "pending" ? null : params.reviewedAt,
        review_note: params.reviewNote,
        updated_at: params.reviewedAt,
      };

      const { data, error } = await supabase
        .from("workspace_memory_documents")
        .update(row)
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.memoryId)
        .select(REVIEWABLE_MEMORY_SELECT)
        .single<ReviewableMemoryDocumentRow>();

      if (error !== null) {
        throw error;
      }

      return mapReviewableMemoryDocumentRow(data);
    },

    async semanticMemorySearch(params) {
      const { data, error } = await supabase.rpc("match_workspace_memory_documents", {
        workspace: params.workspaceId,
        query_embedding: params.embedding,
        match_count: params.limit ?? 5,
        min_similarity: params.minSimilarity ?? 0.2,
      });

      if (error !== null) {
        throw error;
      }

      return ((data ?? []) as RuntimeMemoryDocumentRow[]).map((row) => ({
        id: row.id,
        memoryType: row.memory_type,
        title: row.title,
        body: row.body,
        confidence: row.confidence,
        lastObservedAt: row.last_observed_at,
        ...(row.similarity === undefined ? {} : { similarity: row.similarity }),
      }));
    },

    async saveMemoryEmbedding(params) {
      const { error } = await supabase
        .from("workspace_memory_documents")
        .update({
          embedding: params.embedding,
          embedding_text: params.embeddingText,
          embedded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.memoryId);

      if (error !== null) {
        throw error;
      }
    },

    async listRoutingOverrideSignals(params) {
      const { data, error } = await supabase
        .from("agent_outcomes")
        .select("workspace_id, recorded_at, signal_value")
        .eq("signal_type", "routing_overridden")
        .gte("recorded_at", params.sinceIso)
        .order("recorded_at", { ascending: false })
        .limit(params.limit * 10)
        .returns<RoutingOverrideOutcomeRow[]>();

      if (error !== null) {
        throw error;
      }

      const grouped = new Map<string, {
        workspaceId: string;
        latestObservedAt: string;
        operatorMemberIds: Set<string>;
        aiSuggestedMemberIds: Set<string>;
        count: number;
      }>();

      for (const row of data ?? []) {
        const current = grouped.get(row.workspace_id) ?? {
          workspaceId: row.workspace_id,
          latestObservedAt: row.recorded_at,
          operatorMemberIds: new Set<string>(),
          aiSuggestedMemberIds: new Set<string>(),
          count: 0,
        };
        current.count += 1;
        if (Date.parse(row.recorded_at) > Date.parse(current.latestObservedAt)) {
          current.latestObservedAt = row.recorded_at;
        }
        const operatorChoseMemberId = readString(row.signal_value?.["operatorChoseMemberId"]);
        const aiSuggestedMemberId = readString(row.signal_value?.["aiSuggestedMemberId"]);
        if (operatorChoseMemberId !== null) current.operatorMemberIds.add(operatorChoseMemberId);
        if (aiSuggestedMemberId !== null) current.aiSuggestedMemberIds.add(aiSuggestedMemberId);
        grouped.set(row.workspace_id, current);
      }

      return [...grouped.values()]
        .filter((entry) => entry.count >= params.minCount)
        .slice(0, params.limit)
        .map((entry) => ({
          workspaceId: entry.workspaceId,
          outcomeCount: entry.count,
          latestObservedAt: entry.latestObservedAt,
          operatorMemberIds: [...entry.operatorMemberIds],
          aiSuggestedMemberIds: [...entry.aiSuggestedMemberIds],
        }));
    },

    async listOperatorFeedbackSignals(params) {
      const { data, error } = await supabase
        .from("agent_outcomes")
        .select("workspace_id, recorded_at, signal_type, signal_value")
        .in("signal_type", ["operator_tag_positive", "operator_tag_negative", "operator_tag_note"])
        .gte("recorded_at", params.sinceIso)
        .order("recorded_at", { ascending: false })
        .limit(params.limit * 20)
        .returns<OperatorFeedbackOutcomeRow[]>();

      if (error !== null) {
        throw error;
      }

      const grouped = new Map<string, {
        workspaceId: string;
        signalType: WorkspaceMemoryOperatorFeedbackSignal["signalType"];
        feedbackLabel: string | null;
        feedbackSource: string | null;
        latestObservedAt: string;
        memberIds: Set<string>;
        count: number;
      }>();

      for (const row of data ?? []) {
        const feedbackLabel = readString(row.signal_value?.["feedbackLabel"]);
        const feedbackSource = readString(row.signal_value?.["source"]);
        const groupKey = [
          row.workspace_id,
          row.signal_type,
          feedbackLabel ?? "unlabeled",
          feedbackSource ?? "unknown",
        ].join(":");
        const current = grouped.get(groupKey) ?? {
          workspaceId: row.workspace_id,
          signalType: row.signal_type,
          feedbackLabel,
          feedbackSource,
          latestObservedAt: row.recorded_at,
          memberIds: new Set<string>(),
          count: 0,
        };
        current.count += 1;
        if (Date.parse(row.recorded_at) > Date.parse(current.latestObservedAt)) {
          current.latestObservedAt = row.recorded_at;
        }
        const memberId = readString(row.signal_value?.["memberId"]);
        if (memberId !== null) current.memberIds.add(memberId);
        grouped.set(groupKey, current);
      }

      return [...grouped.values()]
        .filter((entry) => entry.count >= params.minCount)
        .slice(0, params.limit)
        .map((entry) => ({
          workspaceId: entry.workspaceId,
          signalType: entry.signalType,
          feedbackLabel: entry.feedbackLabel,
          feedbackSource: entry.feedbackSource,
          outcomeCount: entry.count,
          latestObservedAt: entry.latestObservedAt,
          memberIds: [...entry.memberIds],
        }));
    },

    async listLeadOutcomeSignals(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("workspace_id, status, source_channel, lead_type, target_area, timeline, budget_min, budget_max, score, updated_at")
        .in("status", ["qualified", "hot", "active_client", "closed_won", "closed_lost", "archived"])
        .gte("updated_at", params.sinceIso)
        .order("updated_at", { ascending: false })
        .limit(params.limit * 50)
        .returns<LeadMemorySignalRow[]>();

      if (error !== null) {
        throw error;
      }

      const grouped = new Map<string, {
        workspaceId: string;
        signalType: WorkspaceMemoryLeadOutcomeSignal["signalType"];
        sourceChannel: string;
        leadType: string;
        targetArea: string | null;
        latestObservedAt: string;
        finalStatuses: Set<string>;
        scoreTotal: number;
        count: number;
      }>();

      for (const row of data ?? []) {
        const signalType = readOutcomeSignalType(row.status);
        if (signalType === null) continue;
        const targetArea = normalizeGroupText(row.target_area);
        const groupKey = [
          row.workspace_id,
          signalType,
          row.source_channel,
          row.lead_type,
          targetArea ?? "unknown_area",
        ].join(":");
        const current = grouped.get(groupKey) ?? {
          workspaceId: row.workspace_id,
          signalType,
          sourceChannel: row.source_channel,
          leadType: row.lead_type,
          targetArea,
          latestObservedAt: row.updated_at,
          finalStatuses: new Set<string>(),
          scoreTotal: 0,
          count: 0,
        };
        current.count += 1;
        current.scoreTotal += row.score;
        current.finalStatuses.add(row.status);
        if (Date.parse(row.updated_at) > Date.parse(current.latestObservedAt)) {
          current.latestObservedAt = row.updated_at;
        }
        grouped.set(groupKey, current);
      }

      return [...grouped.values()]
        .filter((entry) => entry.count >= params.minCount)
        .slice(0, params.limit)
        .map((entry) => ({
          workspaceId: entry.workspaceId,
          signalType: entry.signalType,
          sourceChannel: entry.sourceChannel,
          leadType: entry.leadType,
          targetArea: entry.targetArea,
          outcomeCount: entry.count,
          latestObservedAt: entry.latestObservedAt,
          finalStatuses: [...entry.finalStatuses],
          averageScore: Math.round(entry.scoreTotal / entry.count),
        }));
    },

    async listMarketSignals(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("workspace_id, status, source_channel, lead_type, target_area, timeline, budget_min, budget_max, score, updated_at")
        .not("target_area", "is", null)
        .neq("intent", "spam")
        .gte("updated_at", params.sinceIso)
        .order("updated_at", { ascending: false })
        .limit(params.limit * 50)
        .returns<LeadMemorySignalRow[]>();

      if (error !== null) {
        throw error;
      }

      const grouped = new Map<string, {
        workspaceId: string;
        targetArea: string;
        leadType: string;
        latestObservedAt: string;
        sourceChannels: Set<string>;
        timelines: Set<string>;
        budgetMin: number | null;
        budgetMax: number | null;
        count: number;
      }>();

      for (const row of data ?? []) {
        const targetArea = normalizeGroupText(row.target_area);
        if (targetArea === null) continue;
        const groupKey = [row.workspace_id, targetArea.toLowerCase(), row.lead_type].join(":");
        const current = grouped.get(groupKey) ?? {
          workspaceId: row.workspace_id,
          targetArea,
          leadType: row.lead_type,
          latestObservedAt: row.updated_at,
          sourceChannels: new Set<string>(),
          timelines: new Set<string>(),
          budgetMin: null,
          budgetMax: null,
          count: 0,
        };
        current.count += 1;
        current.sourceChannels.add(row.source_channel);
        const timeline = normalizeGroupText(row.timeline);
        if (timeline !== null) current.timelines.add(timeline);
        if (row.budget_min !== null) {
          current.budgetMin = current.budgetMin === null ? row.budget_min : Math.min(current.budgetMin, row.budget_min);
        }
        if (row.budget_max !== null) {
          current.budgetMax = current.budgetMax === null ? row.budget_max : Math.max(current.budgetMax, row.budget_max);
        }
        if (Date.parse(row.updated_at) > Date.parse(current.latestObservedAt)) {
          current.latestObservedAt = row.updated_at;
        }
        grouped.set(groupKey, current);
      }

      return [...grouped.values()]
        .filter((entry) => entry.count >= params.minCount)
        .slice(0, params.limit)
        .map((entry) => ({
          workspaceId: entry.workspaceId,
          targetArea: entry.targetArea,
          leadType: entry.leadType,
          outcomeCount: entry.count,
          latestObservedAt: entry.latestObservedAt,
          sourceChannels: [...entry.sourceChannels],
          timelines: [...entry.timelines],
          budgetMin: entry.budgetMin,
          budgetMax: entry.budgetMax,
        }));
    },

    async listSourceChannelSignals(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("workspace_id, status, source_channel, lead_type, target_area, timeline, budget_min, budget_max, score, updated_at")
        .gte("updated_at", params.sinceIso)
        .order("updated_at", { ascending: false })
        .limit(params.limit * 50)
        .returns<LeadMemorySignalRow[]>();

      if (error !== null) {
        throw error;
      }

      const grouped = new Map<string, {
        workspaceId: string;
        sourceChannel: string;
        leadType: string;
        latestObservedAt: string;
        qualifiedCount: number;
        convertedCount: number;
        churnedCount: number;
        count: number;
      }>();

      for (const row of data ?? []) {
        const groupKey = [row.workspace_id, row.source_channel, row.lead_type].join(":");
        const current = grouped.get(groupKey) ?? {
          workspaceId: row.workspace_id,
          sourceChannel: row.source_channel,
          leadType: row.lead_type,
          latestObservedAt: row.updated_at,
          qualifiedCount: 0,
          convertedCount: 0,
          churnedCount: 0,
          count: 0,
        };
        current.count += 1;
        if (row.status === "qualified" || row.status === "hot") current.qualifiedCount += 1;
        if (row.status === "active_client" || row.status === "closed_won") current.convertedCount += 1;
        if (row.status === "closed_lost" || row.status === "archived") current.churnedCount += 1;
        if (Date.parse(row.updated_at) > Date.parse(current.latestObservedAt)) {
          current.latestObservedAt = row.updated_at;
        }
        grouped.set(groupKey, current);
      }

      return [...grouped.values()]
        .filter((entry) => entry.count >= params.minCount)
        .slice(0, params.limit)
        .map((entry) => ({
          workspaceId: entry.workspaceId,
          sourceChannel: entry.sourceChannel,
          leadType: entry.leadType,
          outcomeCount: entry.count,
          qualifiedCount: entry.qualifiedCount,
          convertedCount: entry.convertedCount,
          churnedCount: entry.churnedCount,
          latestObservedAt: entry.latestObservedAt,
        }));
    },

    async listObjectionSignals(params) {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("workspace_id, body, source_channel, created_at")
        .eq("sender_type", "customer")
        .gte("created_at", params.sinceIso)
        .order("created_at", { ascending: false })
        .limit(params.limit * 80)
        .returns<ConversationMessageMemorySignalRow[]>();

      if (error !== null) {
        throw error;
      }

      const grouped = new Map<string, {
        workspaceId: string;
        objectionType: WorkspaceMemoryObjectionSignal["objectionType"];
        latestObservedAt: string;
        sourceChannels: Set<string>;
        examples: string[];
        count: number;
      }>();

      for (const row of data ?? []) {
        const objectionType = detectObjectionType(row.body);
        const observedAt = row.created_at ?? new Date().toISOString();
        if (objectionType === null) continue;
        const groupKey = [row.workspace_id, objectionType].join(":");
        const current = grouped.get(groupKey) ?? {
          workspaceId: row.workspace_id,
          objectionType,
          latestObservedAt: observedAt,
          sourceChannels: new Set<string>(),
          examples: [],
          count: 0,
        };
        current.count += 1;
        const sourceChannel = normalizeGroupText(row.source_channel);
        if (sourceChannel !== null) current.sourceChannels.add(sourceChannel);
        const example = row.body.trim().slice(0, 160);
        if (example.length > 0 && current.examples.length < 3) current.examples.push(example);
        if (Date.parse(observedAt) > Date.parse(current.latestObservedAt)) {
          current.latestObservedAt = observedAt;
        }
        grouped.set(groupKey, current);
      }

      return [...grouped.values()]
        .filter((entry) => entry.count >= params.minCount)
        .slice(0, params.limit)
        .map((entry) => ({
          workspaceId: entry.workspaceId,
          objectionType: entry.objectionType,
          outcomeCount: entry.count,
          latestObservedAt: entry.latestObservedAt,
          sourceChannels: [...entry.sourceChannels],
          examples: entry.examples,
        }));
    },
  };
}
