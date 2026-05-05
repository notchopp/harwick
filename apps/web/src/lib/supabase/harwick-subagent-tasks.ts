import type {
  HarwickSubagentTask,
  HarwickSubagentTaskRepository,
  HarwickSubagentType,
} from "../../features/agent-runtime/execute-subagent-tasks";
import type { Json, TablesUpdate } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

type HarwickSubagentTaskRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  trajectory_id: string | null;
  step_id: string | null;
  subagent_type: string;
  priority: string;
  title: string;
  instructions: string;
  payload: Json;
  created_at: string;
};

type LeadAssignmentRow = {
  assigned_agent_id: string | null;
};

function payloadAsRecord(payload: Json): Record<string, unknown> {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload
    : {};
}

function parseSubagentType(value: string): HarwickSubagentType {
  if (value === "research" || value === "writer" || value === "calendar" || value === "routing") {
    return value;
  }
  return "research";
}

function parsePriority(value: string): HarwickSubagentTask["priority"] {
  if (value === "low" || value === "normal" || value === "high" || value === "urgent") {
    return value;
  }
  return "normal";
}

function mapTaskRow(row: HarwickSubagentTaskRow): HarwickSubagentTask {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    leadId: row.lead_id,
    trajectoryId: row.trajectory_id,
    stepId: row.step_id,
    subagentType: parseSubagentType(row.subagent_type),
    priority: parsePriority(row.priority),
    title: row.title,
    instructions: row.instructions,
    payload: payloadAsRecord(row.payload),
    createdAt: row.created_at,
  };
}

export function createSupabaseHarwickSubagentTaskRepository(
  supabase: RealtyOpsSupabaseClient,
): HarwickSubagentTaskRepository {
  return {
    async listQueuedTasks(params) {
      const { data, error } = await supabase
        .from("harwick_subagent_tasks")
        .select("id, workspace_id, lead_id, trajectory_id, step_id, subagent_type, priority, title, instructions, payload, created_at")
        .eq("status", "queued")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(params.limit)
        .returns<HarwickSubagentTaskRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapTaskRow);
    },

    async markTaskRunning(params) {
      const update: TablesUpdate<"harwick_subagent_tasks"> = {
        status: "running",
        error_message: null,
        updated_at: params.nowIso,
      };
      const { data, error } = await supabase
        .from("harwick_subagent_tasks")
        .update(update)
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.taskId)
        .eq("status", "queued")
        .select("id")
        .maybeSingle<{ id: string }>();

      if (error !== null) {
        throw error;
      }

      return data !== null;
    },

    async markTaskCompleted(params) {
      const update: TablesUpdate<"harwick_subagent_tasks"> = {
        status: "completed",
        result: params.result,
        error_message: null,
        updated_at: params.nowIso,
      };
      const { error } = await supabase
        .from("harwick_subagent_tasks")
        .update(update)
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.taskId);

      if (error !== null) {
        throw error;
      }
    },

    async markTaskFailed(params) {
      const update: TablesUpdate<"harwick_subagent_tasks"> = {
        status: "failed",
        error_message: params.errorMessage.slice(0, 1000),
        updated_at: params.nowIso,
      };
      const { error } = await supabase
        .from("harwick_subagent_tasks")
        .update(update)
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.taskId);

      if (error !== null) {
        throw error;
      }
    },

    async resolveLeadAssignedMember(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("assigned_agent_id")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .maybeSingle<LeadAssignmentRow>();

      if (error !== null) {
        throw error;
      }

      return data?.assigned_agent_id ?? null;
    },
  };
}
