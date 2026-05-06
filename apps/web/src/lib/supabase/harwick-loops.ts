import {
  HarwickLoopCreateSchema,
  HarwickLoopSchema,
  type HarwickLoop,
  type HarwickLoopCreate,
  type HarwickLoopRunStatus,
} from "@realty-ops/core";
import type {
  HarwickLoopInsertRow,
  HarwickLoopRunInsertRow,
  HarwickLoopRunUpdateRow,
  HarwickLoopUpdateRow,
  Json,
} from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

type HarwickLoopDbRow = {
  id: string;
  workspace_id: string;
  created_by_member_id: string | null;
  name: string;
  instruction: string;
  trigger_type: string;
  schedule_spec: string | null;
  event_type: string | null;
  status: string;
  approval_mode: string;
  output_mode: string;
  tool_allowlist: string[];
  next_run_at: string | null;
  last_run_at: string | null;
  last_run_status: string | null;
  created_at: string;
  updated_at: string;
};

export type HarwickLoopRunCreateResult = {
  runId: string;
};

export type HarwickLoopRunCompletion = {
  workspaceId: string;
  loopId: string;
  runId: string;
  nowIso: string;
  status: HarwickLoopRunStatus;
  resultSummary?: string | null;
  errorMessage?: string | null;
  workItemId?: string | null;
  nextRunAt?: string | null;
};

export type HarwickLoopRepository = {
  listWorkspaceLoops(params: { workspaceId: string; limit: number }): Promise<HarwickLoop[]>;
  createLoop(loop: HarwickLoopCreate): Promise<HarwickLoop>;
  updateLoop(params: {
    workspaceId: string;
    loopId: string;
    patch: Partial<HarwickLoopCreate>;
    nowIso: string;
  }): Promise<HarwickLoop>;
  listDueScheduledLoops(params: { nowIso: string; limit: number }): Promise<HarwickLoop[]>;
  createRun(params: {
    workspaceId: string;
    loopId: string;
    instructionSnapshot: string;
    nowIso: string;
    metadata?: Record<string, unknown>;
  }): Promise<HarwickLoopRunCreateResult>;
  completeRun(params: HarwickLoopRunCompletion): Promise<void>;
};

function mapRowToLoop(row: HarwickLoopDbRow): HarwickLoop {
  return HarwickLoopSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    createdByMemberId: row.created_by_member_id,
    name: row.name,
    instruction: row.instruction,
    triggerType: row.trigger_type,
    scheduleSpec: row.schedule_spec,
    eventType: row.event_type,
    status: row.status,
    approvalMode: row.approval_mode,
    outputMode: row.output_mode,
    toolAllowlist: row.tool_allowlist,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    lastRunStatus: row.last_run_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapCreateToInsert(loop: HarwickLoopCreate): HarwickLoopInsertRow {
  const parsed = HarwickLoopCreateSchema.parse(loop);
  return {
    workspace_id: parsed.workspaceId,
    created_by_member_id: parsed.createdByMemberId,
    name: parsed.name,
    instruction: parsed.instruction,
    trigger_type: parsed.triggerType,
    schedule_spec: parsed.scheduleSpec,
    event_type: parsed.eventType,
    status: parsed.status,
    approval_mode: parsed.approvalMode,
    output_mode: parsed.outputMode,
    tool_allowlist: parsed.toolAllowlist,
    next_run_at: parsed.nextRunAt,
    last_run_at: parsed.lastRunAt,
    last_run_status: parsed.lastRunStatus,
  };
}

function mapPatchToUpdate(patch: Partial<HarwickLoopCreate>, nowIso: string): HarwickLoopUpdateRow {
  return {
    ...(patch.createdByMemberId === undefined ? {} : { created_by_member_id: patch.createdByMemberId }),
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(patch.instruction === undefined ? {} : { instruction: patch.instruction }),
    ...(patch.triggerType === undefined ? {} : { trigger_type: patch.triggerType }),
    ...(patch.scheduleSpec === undefined ? {} : { schedule_spec: patch.scheduleSpec }),
    ...(patch.eventType === undefined ? {} : { event_type: patch.eventType }),
    ...(patch.status === undefined ? {} : { status: patch.status }),
    ...(patch.approvalMode === undefined ? {} : { approval_mode: patch.approvalMode }),
    ...(patch.outputMode === undefined ? {} : { output_mode: patch.outputMode }),
    ...(patch.toolAllowlist === undefined ? {} : { tool_allowlist: patch.toolAllowlist }),
    ...(patch.nextRunAt === undefined ? {} : { next_run_at: patch.nextRunAt }),
    updated_at: nowIso,
  };
}

export function createSupabaseHarwickLoopRepository(
  supabase: RealtyOpsSupabaseClient,
): HarwickLoopRepository {
  return {
    async listWorkspaceLoops(params) {
      const { data, error } = await supabase
        .from("harwick_loops")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .order("updated_at", { ascending: false })
        .limit(params.limit)
        .returns<HarwickLoopDbRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapRowToLoop);
    },

    async createLoop(loop) {
      const insert = mapCreateToInsert(loop);
      const { data, error } = await supabase
        .from("harwick_loops")
        .insert(insert)
        .select("*")
        .single<HarwickLoopDbRow>();

      if (error !== null) {
        throw error;
      }

      return mapRowToLoop(data);
    },

    async updateLoop(params) {
      const update = mapPatchToUpdate(params.patch, params.nowIso);
      const { data, error } = await supabase
        .from("harwick_loops")
        .update(update)
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.loopId)
        .select("*")
        .single<HarwickLoopDbRow>();

      if (error !== null) {
        throw error;
      }

      return mapRowToLoop(data);
    },

    async listDueScheduledLoops(params) {
      const { data, error } = await supabase
        .from("harwick_loops")
        .select("*")
        .eq("status", "active")
        .eq("trigger_type", "schedule")
        .not("next_run_at", "is", null)
        .lte("next_run_at", params.nowIso)
        .order("next_run_at", { ascending: true })
        .limit(params.limit)
        .returns<HarwickLoopDbRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapRowToLoop);
    },

    async createRun(params) {
      const insert: HarwickLoopRunInsertRow = {
        workspace_id: params.workspaceId,
        loop_id: params.loopId,
        status: "running",
        started_at: params.nowIso,
        instruction_snapshot: params.instructionSnapshot,
        metadata: (params.metadata ?? {}) as Json,
      };
      const { data, error } = await supabase
        .from("harwick_loop_runs")
        .insert(insert)
        .select("id")
        .single<{ id: string }>();

      if (error !== null) {
        throw error;
      }

      return { runId: data.id };
    },

    async completeRun(params) {
      const runUpdate: HarwickLoopRunUpdateRow = {
        status: params.status,
        completed_at: params.nowIso,
        result_summary: params.resultSummary ?? null,
        error_message: params.errorMessage ?? null,
        work_item_id: params.workItemId ?? null,
      };
      const { error: runError } = await supabase
        .from("harwick_loop_runs")
        .update(runUpdate)
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.runId);

      if (runError !== null) {
        throw runError;
      }

      const loopUpdate: HarwickLoopUpdateRow = {
        last_run_at: params.nowIso,
        last_run_status: params.status,
        next_run_at: params.nextRunAt ?? null,
        updated_at: params.nowIso,
      };
      const { error: loopError } = await supabase
        .from("harwick_loops")
        .update(loopUpdate)
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.loopId);

      if (loopError !== null) {
        throw loopError;
      }
    },
  };
}
