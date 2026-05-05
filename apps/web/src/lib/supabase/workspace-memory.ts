import {
  WorkspaceMemoryDocumentCreateSchema,
  type WorkspaceMemoryDocumentCreate,
} from "@realty-ops/core";
import type { WorkspaceMemoryDocumentInsertRow, Json } from "./database.types";
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

type RuntimeMemoryDocumentRow = {
  id: string;
  memory_type: string;
  title: string;
  body: string;
  confidence: number;
  last_observed_at: string | null;
  similarity?: number;
};

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

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
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
  };
}
