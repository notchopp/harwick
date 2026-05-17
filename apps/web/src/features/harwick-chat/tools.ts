import {
  HarwickChannelCreateSchema,
  HarwickLoopCreateSchema,
  detectHarwickMention,
  workspaceRoleHasCapability,
  type WorkspaceRole,
} from "@realty-ops/core";
import { createOpenAIEmbeddingClient } from "@realty-ops/integrations";
import type { OpenAIProvider } from "@ai-sdk/openai";
import { tool } from "ai";
import { z } from "zod";

import { getServerEnvironment } from "../../lib/server-env";

import { loadRecentLeads } from "../home/recent-leads";
import { loadRoutingDesk } from "../home/routing-desk";
import { loadTeamPresence } from "../home/team-presence";
import { createSupabaseRecentLeadsRepository } from "../../lib/supabase/recent-leads";
import { createSupabaseRoutingDeskRepository } from "../../lib/supabase/routing-desk";
import { createSupabaseTeamPresenceRepository } from "../../lib/supabase/team-presence";
import {
  createSupabaseHarwickLoopApprovalRepository,
  createSupabaseHarwickWorkItemRepository,
} from "../../lib/supabase/harwick-work-items";
import { createSupabaseHarwickSubagentTaskRepository } from "../../lib/supabase/harwick-subagent-tasks";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import {
  executeHarwickSubagentTask,
  type HarwickSubagentExecutorClient,
  type HarwickSubagentTask,
} from "../agent-runtime/execute-subagent-tasks";
import { computeNextHarwickLoopRunAt } from "../agent-runtime/execute-harwick-loops";
import type { HarwickWorkItemIntelligenceClient } from "../agent-runtime/harwick-work-item-intelligence";
import { createSupabaseHarwickLoopRepository } from "../../lib/supabase/harwick-loops";

type ToolDeps = {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  workspaceName: string;
  operatorMemberId: string;
  operatorName: string;
  operatorRole: WorkspaceRole;
  subagentExecutorClient?: HarwickSubagentExecutorClient;
  subagentIntelligenceClient?: HarwickWorkItemIntelligenceClient;
  // Optional OpenAI provider — present, web_search becomes a provider-managed tool.
  // Absent (e.g. tests), web_search is omitted from the registry.
  openai?: OpenAIProvider;
};

type LeadCard = {
  kind: "lead_card";
  leadId: string;
  name: string;
  source: string | null;
  status: string | null;
  summary: string;
  assignedTo: string | null;
  score: number | null;
  openLeadHref: string;
  openConvoHref: string;
};

type SubagentTaskCard = {
  kind: "subagent_task";
  taskId: string;
  status: string;
  title: string;
  subagentType: string;
  priority: string;
  instructions: string;
  result: unknown;
  errorMessage: string | null;
  updatedAt: string;
  surfaced?: boolean;
};

function canReadAllLeads(role: WorkspaceRole): boolean {
  return workspaceRoleHasCapability(role, "leads.read_all");
}

function canReadOperations(role: WorkspaceRole): boolean {
  return workspaceRoleHasCapability(role, "operations.read");
}

function canManageRouting(role: WorkspaceRole): boolean {
  return workspaceRoleHasCapability(role, "routing.manage");
}

function canSpawnChannels(role: WorkspaceRole): boolean {
  // Viewers are read-only. Everyone else can spawn rooms (the new channel is
  // only visible to its members, so this is no broader than Slack semantics).
  return role !== "viewer";
}

function canCreateLoops(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin" || role === "team_lead" || role === "lead_manager";
}

function formatLeadName(row: {
  id: string;
  full_name: string | null;
  instagram_username: string | null;
  email: string | null;
  phone: string | null;
}): string {
  return row.full_name ?? row.instagram_username ?? row.email ?? row.phone ?? `Lead ${row.id.slice(0, 8)}`;
}

function formatBudget(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `$${min.toLocaleString()}-$${max.toLocaleString()}`;
  if (min !== null) return `from $${min.toLocaleString()}`;
  return max === null ? null : `up to $${max.toLocaleString()}`;
}

function compactLeadSummary(row: {
  source_channel: string | null;
  lead_type: string | null;
  target_area: string | null;
  timeline: string | null;
  budget_min: number | null;
  budget_max: number | null;
  last_message_at: string | null;
}): string {
  const pieces = [
    row.source_channel,
    row.lead_type,
    row.target_area,
    row.timeline,
    formatBudget(row.budget_min, row.budget_max),
    row.last_message_at === null ? null : `last touched ${row.last_message_at.slice(0, 10)}`,
  ].filter((piece): piece is string => typeof piece === "string" && piece.length > 0);
  return pieces.length === 0 ? "No qualification summary is available yet." : pieces.join(" · ");
}

async function canAccessLead(params: {
  deps: ToolDeps;
  leadId: string;
}): Promise<boolean> {
  if (canReadAllLeads(params.deps.operatorRole)) return true;

  const { data, error } = await params.deps.supabase
    .from("leads")
    .select("id")
    .eq("workspace_id", params.deps.workspaceId)
    .eq("id", params.leadId)
    .eq("assigned_agent_id", params.deps.operatorMemberId)
    .maybeSingle();

  return error === null && data !== null;
}

export function buildHarwickChatTools(deps: ToolDeps) {
  const recentLeadsRepo = createSupabaseRecentLeadsRepository(deps.supabase);
  const routingDeskRepo = createSupabaseRoutingDeskRepository(deps.supabase);
  const teamPresenceRepo = createSupabaseTeamPresenceRepository(deps.supabase);
  const loopApprovalRepo = createSupabaseHarwickLoopApprovalRepository(deps.supabase);
  const subagentTaskRepo = createSupabaseHarwickSubagentTaskRepository(deps.supabase);
  const workItemRepo = createSupabaseHarwickWorkItemRepository(deps.supabase);
  const loopRepo = createSupabaseHarwickLoopRepository(deps.supabase);

  return {
    list_leads: tool({
      description: "List leads in the workspace. Use filter='hot' for high-priority leads needing attention, 'unassigned' for leads needing routing, 'mine' for leads assigned to the current operator, or 'all' for everything recent.",
      inputSchema: z.object({
        filter: z.enum(["hot", "unassigned", "mine", "all"]).describe("Which slice of leads to return."),
        limit: z.number().int().min(1).max(20).optional().default(8),
      }),
      async execute({ filter, limit }) {
        if (!canReadAllLeads(deps.operatorRole)) {
          if (filter === "unassigned" || filter === "all") {
            return {
              filter: "mine",
              count: 0,
              leads: [],
              note: "This role can only see leads assigned to them.",
            };
          }

          let query = deps.supabase
            .from("leads")
            .select("id, full_name, instagram_username, email, phone, status, lead_type, source_channel, target_area, timeline, budget_min, budget_max, score, assigned_agent_id, last_message_at, created_at")
            .eq("workspace_id", deps.workspaceId)
            .eq("assigned_agent_id", deps.operatorMemberId)
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .limit(limit ?? 8);

          if (filter === "hot") {
            query = query.gte("score", 70);
          }

          const { data, error } = await query;
          if (error !== null) {
            return { filter, count: 0, leads: [], error: error.message };
          }

          return {
            filter: filter === "hot" ? "hot" : "mine",
            count: data?.length ?? 0,
            leads: (data ?? []).map((lead) => ({
              leadId: lead.id,
              name: formatLeadName(lead),
              source: lead.source_channel,
              stage: lead.status,
              assignedTo: deps.operatorName,
              lastTouch: lead.last_message_at ?? lead.created_at,
              openLeadHref: `/leads?leadId=${lead.id}`,
              openConvoHref: `/conversations?leadId=${lead.id}`,
            })),
          };
        }

        const result = await loadRecentLeads({
          workspaceId: deps.workspaceId,
          repository: recentLeadsRepo,
          limit: limit ?? 8,
        });

        let items = result.items;
        if (filter === "hot") {
          items = items.filter((lead) => lead.stage === "new" || lead.stage === "qualified" || lead.stage === "review");
        } else if (filter === "unassigned") {
          items = items.filter((lead) => lead.assignedDisplayName === null);
        } else if (filter === "mine") {
          items = items.filter((lead) => lead.assignedDisplayName !== null && lead.assignedDisplayName.toLowerCase().includes(deps.operatorName.toLowerCase().split(/\s+/)[0] ?? "__nomatch__"));
        }

        return {
          filter,
          count: items.length,
          leads: items.map((lead) => ({
            leadId: lead.id,
            name: lead.name,
            source: lead.source,
            stage: lead.stageLabel,
            assignedTo: lead.assignedDisplayName,
            lastTouch: lead.lastTouchLabel,
            openLeadHref: `/leads?leadId=${lead.id}`,
            openConvoHref: `/conversations?leadId=${lead.id}`,
          })),
        };
      },
    }),

    list_routing_desk: tool({
      description: "List leads in the routing desk — leads waiting for a routing decision or approval.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).optional().default(8),
      }),
      async execute({ limit }) {
        if (!canManageRouting(deps.operatorRole)) {
          return {
            count: 0,
            decisions: [],
            error: "This role cannot view or manage the routing desk.",
          };
        }

        const result = await loadRoutingDesk({
          workspaceId: deps.workspaceId,
          repository: routingDeskRepo,
          limit: limit ?? 8,
        });

        return {
          count: result.items.length,
          decisions: result.items.map((item) => ({
            leadId: item.leadId,
            leadName: item.leadName,
            recommendedAssignee: item.decision.assignedDisplayName ?? "owner review",
            reason: item.decision.reasons[0] ?? item.decision.taskLabel,
            requiresApproval: item.decision.status !== "assigned",
            summary: item.summary,
          })),
        };
      },
    }),

    list_team: tool({
      description: "List team members in the workspace with their status (online/away/offline), current open work, and role.",
      inputSchema: z.object({}),
      async execute() {
        if (!canReadOperations(deps.operatorRole)) {
          return {
            count: 0,
            members: [],
            error: "This role cannot view team workload or presence.",
          };
        }

        const result = await loadTeamPresence({
          workspaceId: deps.workspaceId,
          repository: teamPresenceRepo,
        });

        return {
          count: result.members.length,
          members: result.members.map((member) => ({
            memberId: member.id,
            name: member.name,
            role: member.roleLabel,
            status: member.status,
            openWork: member.openWork,
            activeLeads: member.activeLeadCount,
            lastSeen: member.lastSeen,
          })),
        };
      },
    }),

    get_lead_detail: tool({
      description: "Get detailed information about a specific lead — qualification state, automation mode, recent activity, and assignment. Use the leadId returned by list_leads.",
      inputSchema: z.object({
        leadId: z.string().uuid(),
      }),
      async execute({ leadId }) {
        const { data, error } = await deps.supabase
          .from("leads")
          .select("id, full_name, instagram_username, email, phone, status, lead_type, source_channel, target_area, timeline, budget_min, budget_max, score, assigned_agent_id, last_message_at, created_at")
          .eq("workspace_id", deps.workspaceId)
          .eq("id", leadId)
          .maybeSingle();

        if (error !== null || data === null) {
          return { found: false, message: error?.message ?? "Lead not found in this workspace." };
        }
        if (!canReadAllLeads(deps.operatorRole) && data.assigned_agent_id !== deps.operatorMemberId) {
          return { found: false, message: "This lead is outside your assigned scope." };
        }

        return {
          found: true,
          lead: {
            id: data.id,
            name: data.full_name ?? data.instagram_username ?? data.email ?? data.phone ?? `Lead ${data.id.slice(0, 8)}`,
            status: data.status,
            type: data.lead_type,
            source: data.source_channel,
            targetArea: data.target_area,
            timeline: data.timeline,
            budget: data.budget_min !== null || data.budget_max !== null
              ? `$${(data.budget_min ?? 0).toLocaleString()} - $${(data.budget_max ?? 0).toLocaleString()}`
              : null,
            score: data.score,
            assignedAgentId: data.assigned_agent_id,
            lastMessageAt: data.last_message_at,
            createdAt: data.created_at,
            openLeadHref: `/leads?leadId=${data.id}`,
            openConvoHref: `/conversations?leadId=${data.id}`,
          },
        };
      },
    }),

    surface_lead: tool({
      description: "Render one specific lead as an actionable card. Use after lookup tools when you mention a lead by name. This is visible to the operator.",
      inputSchema: z.object({
        leadId: z.string().uuid(),
        reason: z.string().min(1).max(240).describe("Short reason this lead matters right now."),
      }),
      async execute({ leadId, reason }): Promise<LeadCard & { reason: string }> {
        const { data, error } = await deps.supabase
          .from("leads")
          .select("id, full_name, instagram_username, email, phone, status, lead_type, source_channel, target_area, timeline, budget_min, budget_max, score, assigned_agent_id, last_message_at")
          .eq("workspace_id", deps.workspaceId)
          .eq("id", leadId)
          .maybeSingle();

        if (error !== null || data === null) {
          return {
            kind: "lead_card",
            leadId,
            name: "Lead unavailable",
            source: null,
            status: "missing",
            summary: error?.message ?? "Lead not found in this workspace.",
            assignedTo: null,
            score: null,
            openLeadHref: `/leads?leadId=${leadId}`,
            openConvoHref: `/conversations?leadId=${leadId}`,
            reason,
          };
        }
        if (!canReadAllLeads(deps.operatorRole) && data.assigned_agent_id !== deps.operatorMemberId) {
          return {
            kind: "lead_card",
            leadId,
            name: "Lead unavailable",
            source: null,
            status: "restricted",
            summary: "This lead is outside your assigned scope.",
            assignedTo: null,
            score: null,
            openLeadHref: "/leads",
            openConvoHref: "/conversations",
            reason,
          };
        }

        return {
          kind: "lead_card",
          leadId: data.id,
          name: formatLeadName(data),
          source: data.source_channel,
          status: data.status,
          summary: compactLeadSummary(data),
          assignedTo: data.assigned_agent_id,
          score: data.score,
          openLeadHref: `/leads?leadId=${data.id}`,
          openConvoHref: `/conversations?leadId=${data.id}`,
          reason,
        };
      },
    }),

    surface_routing_decision: tool({
      description: "Render a single routing decision card. Use after list_routing_desk when one routing item is worth operator attention. This is visible to the operator.",
      inputSchema: z.object({
        leadId: z.string().uuid(),
        reason: z.string().min(1).max(240),
      }),
      async execute({ leadId, reason }) {
        if (!canManageRouting(deps.operatorRole)) {
          return {
            kind: "routing_card",
            leadId,
            leadName: "Routing restricted",
            recommendedAssignee: "owner review",
            summary: "This role cannot view or manage routing decisions.",
            requiresApproval: true,
            reason,
            openLeadHref: "/leads",
            openConvoHref: "/conversations",
          };
        }

        const result = await loadRoutingDesk({
          workspaceId: deps.workspaceId,
          repository: routingDeskRepo,
          limit: 20,
        });
        const item = result.items.find((candidate) => candidate.leadId === leadId);
        if (item === undefined) {
          return {
            kind: "routing_card",
            leadId,
            leadName: "Routing item unavailable",
            recommendedAssignee: "owner review",
            summary: "That lead is no longer in the routing desk.",
            requiresApproval: true,
            reason,
            openLeadHref: `/leads?leadId=${leadId}`,
            openConvoHref: `/conversations?leadId=${leadId}`,
          };
        }
        return {
          kind: "routing_card",
          leadId: item.leadId,
          leadName: item.leadName,
          recommendedAssignee: item.decision.assignedDisplayName ?? "owner review",
          summary: item.summary,
          requiresApproval: item.decision.status !== "assigned",
          reason: item.decision.reasons[0] ?? reason,
          openLeadHref: `/leads?leadId=${item.leadId}`,
          openConvoHref: `/conversations?leadId=${item.leadId}`,
        };
      },
    }),

    list_subagent_tasks: tool({
      description: "List recent specialist subagent tasks and their status/results. Use when the operator asks what a subagent is doing, asks for an update, or asks about background work.",
      inputSchema: z.object({
        status: z.enum(["queued", "running", "completed", "failed", "all"]).default("all"),
        limit: z.number().int().min(1).max(10).default(5),
      }),
      async execute({ status, limit }) {
        let query = deps.supabase
          .from("harwick_subagent_tasks")
          .select("id, subagent_type, status, priority, title, instructions, result, error_message, updated_at")
          .eq("workspace_id", deps.workspaceId)
          .order("updated_at", { ascending: false })
          .limit(limit);
        if (!canReadOperations(deps.operatorRole)) {
          query = query.contains("payload", { operatorMemberId: deps.operatorMemberId });
        }
        if (status !== "all") {
          query = query.eq("status", status);
        }

        const { data, error } = await query;
        if (error !== null) {
          return { count: 0, tasks: [], error: error.message };
        }

        return {
          count: data?.length ?? 0,
          tasks: (data ?? []).map((task): SubagentTaskCard => ({
            kind: "subagent_task",
            taskId: task.id,
            status: task.status,
            title: task.title,
            subagentType: task.subagent_type,
            priority: task.priority,
            instructions: task.instructions,
            result: task.result,
            errorMessage: task.error_message,
            updatedAt: task.updated_at,
          })),
        };
      },
    }),

    cancel_subagent_task: tool({
      description: "Cancel the most relevant queued or running specialist subagent task. Use when the operator says stop, cancel, or kill a background subagent. If no taskId is known, cancel the newest queued/running task in this workspace.",
      inputSchema: z.object({
        taskId: z.string().uuid().nullable().default(null),
        reason: z.string().min(1).max(240).default("Cancelled by operator request."),
      }),
      async execute({ taskId, reason }) {
        let targetTaskId = taskId;
        if (targetTaskId === null) {
          let query = deps.supabase
            .from("harwick_subagent_tasks")
            .select("id")
            .eq("workspace_id", deps.workspaceId)
            .in("status", ["queued", "running"])
            .order("updated_at", { ascending: false })
            .limit(1);
          if (!canReadOperations(deps.operatorRole)) {
            query = query.contains("payload", { operatorMemberId: deps.operatorMemberId });
          }
          const { data, error } = await query.maybeSingle<{ id: string }>();
          if (error !== null) {
            return { cancelled: false, error: error.message };
          }
          targetTaskId = data?.id ?? null;
        }

        if (targetTaskId === null) {
          return { cancelled: false, message: "No queued or running subagent task is available to cancel." };
        }

        const nowIso = new Date().toISOString();
        let updateQuery = deps.supabase
          .from("harwick_subagent_tasks")
          .update({
            status: "failed",
            error_message: reason,
            updated_at: nowIso,
          })
          .eq("workspace_id", deps.workspaceId)
          .eq("id", targetTaskId)
          .in("status", ["queued", "running"]);
        if (!canReadOperations(deps.operatorRole)) {
          updateQuery = updateQuery.contains("payload", { operatorMemberId: deps.operatorMemberId });
        }
        const { data, error } = await updateQuery
          .select("id, subagent_type, status, priority, title, instructions, result, error_message, updated_at")
          .maybeSingle();

        if (error !== null) {
          return { cancelled: false, taskId: targetTaskId, error: error.message };
        }
        if (data === null) {
          return { cancelled: false, taskId: targetTaskId, message: "That subagent task was already completed, failed, or could not be found." };
        }

        return {
          cancelled: true,
          task: {
            kind: "subagent_task",
            taskId: data.id,
            status: data.status,
            title: data.title,
            subagentType: data.subagent_type,
            priority: data.priority,
            instructions: data.instructions,
            result: data.result,
            errorMessage: data.error_message,
            updatedAt: data.updated_at,
          } satisfies SubagentTaskCard,
        };
      },
    }),

    dispatch_subagent: tool({
      description: "Run a specialist subagent (research, writer, calendar, routing) on a durable tracked task, then return its result. Use this for open-ended 'look into X' or 'find me Y' work where Harwick needs another pass before answering.",
      inputSchema: z.object({
        subagentType: z.enum(["research", "writer", "calendar", "routing"]),
        title: z.string().min(1).max(160).describe("Short headline describing the task."),
        instructions: z.string().min(1).max(2000).describe("What the subagent should do."),
        priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
        leadId: z.string().uuid().nullable().default(null).describe("Lead this task relates to, if any."),
      }),
      async execute({ subagentType, title, instructions, priority, leadId }) {
        if (subagentType === "routing" && !canManageRouting(deps.operatorRole)) {
          return {
            kind: "subagent_task",
            queued: false,
            status: "failed",
            subagentType,
            priority,
            title,
            instructions,
            leadId,
            errorMessage: "This role cannot run routing subagents.",
          };
        }
        if (!canReadAllLeads(deps.operatorRole)) {
          if (leadId === null) {
            return {
              kind: "subagent_task",
              queued: false,
              status: "failed",
              subagentType,
              priority,
              title,
              instructions,
              leadId,
              errorMessage: "This role can only run subagents against assigned leads.",
            };
          }
          const allowed = await canAccessLead({ deps, leadId });
          if (!allowed) {
            return {
              kind: "subagent_task",
              queued: false,
              status: "failed",
              subagentType,
              priority,
              title,
              instructions,
              leadId,
              errorMessage: "This lead is outside your assigned scope.",
            };
          }
        }

        const nowIso = new Date().toISOString();
        const payload = {
          source: "harwick_chat_rail",
          operatorMemberId: deps.operatorMemberId,
          operatorName: deps.operatorName,
        };
        const { taskId } = await loopApprovalRepo.enqueueLoopSubagentTask({
          workspaceId: deps.workspaceId,
          leadId,
          trajectoryId: null,
          stepId: null,
          subagentType,
          priority,
          title,
          instructions,
          payload,
          nowIso,
        });

        const task: HarwickSubagentTask = {
          id: taskId,
          workspaceId: deps.workspaceId,
          leadId,
          trajectoryId: null,
          stepId: null,
          subagentType,
          priority,
          title,
          instructions,
          payload,
          createdAt: nowIso,
        };
        const execution = await executeHarwickSubagentTask({
          task,
          taskRepository: subagentTaskRepo,
          workItemRepository: workItemRepo,
          ...(deps.subagentExecutorClient === undefined ? {} : { executorClient: deps.subagentExecutorClient }),
          ...(deps.subagentIntelligenceClient === undefined ? {} : { intelligenceClient: deps.subagentIntelligenceClient }),
          now: () => new Date(nowIso),
        });

        if (execution.status === "completed") {
          return {
            kind: "subagent_task",
            queued: false,
            taskId,
            status: "completed",
            subagentType,
            priority: execution.result.priority ?? priority,
            title,
            instructions,
            leadId,
            result: execution.result,
            errorMessage: null,
            updatedAt: nowIso,
            surfaced: execution.surfaced,
          };
        }

        if (execution.status === "failed") {
          return {
            kind: "subagent_task",
            queued: false,
            taskId,
            status: "failed",
            subagentType,
            priority,
            title,
            instructions,
            leadId,
            result: null,
            errorMessage: execution.errorMessage,
            updatedAt: nowIso,
          };
        }

        return {
          kind: "subagent_task",
          queued: true,
          taskId,
          status: "queued",
          subagentType,
          priority,
          title,
          instructions,
          leadId,
        };
      },
    }),

    create_scheduled_loop: tool({
      description: "Create a recurring Harwick loop from a plain-English operator request. Use when the operator asks Harwick to do something on a cadence, like daily news, weekly queue review, recurring lead audit, or ongoing market research. This persists a real loop and future runs use the cost-effective loop planner/subagent path before surfacing reviewable work. Pick `scope`: 'personal' when the operator asks for something scoped to *them* ('my leads', 'me'), 'workspace' when it's for the whole team.",
      inputSchema: z.object({
        name: z.string().min(1).max(120).describe("Short name for the recurring loop."),
        instruction: z.string().min(1).max(4000).describe("The full recurring job Harwick should perform."),
        scheduleSpec: z.string().min(1).max(240).describe("Plain-English cadence, for example 'every day 9am', 'daily 8am', or 'every Monday 9am'."),
        scope: z.enum(["personal", "workspace"]).default("workspace").describe("'personal' — only visible to the operator; 'workspace' — visible to the whole team. Default workspace."),
        outputMode: z.enum(["work_item", "draft", "agent_loop"]).default("agent_loop"),
        approvalMode: z.enum(["suggest_only", "approval_required", "auto_execute"]).default("approval_required"),
        toolAllowlist: z.array(z.string().min(1).max(80)).max(30).default(["dispatch_subagent"]),
      }),
      async execute({ name, instruction, scheduleSpec, scope, outputMode, approvalMode, toolAllowlist }) {
        if (!canCreateLoops(deps.operatorRole)) {
          return {
            kind: "harwick_loop",
            created: false,
            error: "Only owners, admins, and team leads can create recurring Harwick loops.",
          };
        }

        const nextRunAt = computeNextHarwickLoopRunAt(scheduleSpec, new Date());
        const parsed = HarwickLoopCreateSchema.safeParse({
          workspaceId: deps.workspaceId,
          createdByMemberId: deps.operatorMemberId,
          ownerMemberId: scope === "personal" ? deps.operatorMemberId : null,
          name,
          instruction,
          triggerType: "schedule",
          scheduleSpec,
          eventType: null,
          status: "active",
          approvalMode,
          outputMode,
          toolAllowlist,
          nextRunAt,
          lastRunAt: null,
          lastRunStatus: null,
        });
        if (!parsed.success || nextRunAt === null) {
          return {
            kind: "harwick_loop",
            created: false,
            error: "I could not turn that cadence into a schedule. Try wording it like 'every day 9am' or 'every Monday 9am'.",
          };
        }

        const loop = await loopRepo.createLoop(parsed.data);
        return {
          kind: "harwick_loop",
          created: true,
          loopId: loop.id,
          name: loop.name,
          instruction: loop.instruction,
          scheduleSpec: loop.scheduleSpec,
          nextRunAt: loop.nextRunAt,
          outputMode: loop.outputMode,
          approvalMode: loop.approvalMode,
          toolAllowlist: loop.toolAllowlist,
          scope: loop.ownerMemberId === null ? "workspace" : "personal",
          ownerName: loop.ownerMemberId === null ? null : deps.operatorName,
        };
      },
    }),

    // Stub for when calendar tool is wired through. Returns an empty result so
    // the model knows the tool exists and can call it; we can flesh out the
    // execute body when google_calendar reads land in this path.
    list_calendar: tool({
      description: "List today's showings and meetings on the workspace calendar.",
      inputSchema: z.object({
        dateIso: z.string().describe("ISO date string for the day to list. Defaults to today if omitted."),
      }),
      execute({ dateIso }) {
        return {
          date: dateIso,
          slots: [],
          note: "Calendar tool is wired but no events are surfaced yet from this path. Use the /home calendar pane for the live view.",
        };
      },
    }),

    // Spawn a new collaborative channel. Harwick can do this autonomously when
    // a conversation warrants a real workspace room (e.g. "let's spin up a
    // channel for the 1234 Oak deal"). The operator who triggered Harwick is
    // auto-added as a member alongside any explicitly named member ids.
    create_channel: tool({
      description: "Create a new workspace channel (or DM/group). Use this when a conversation needs its own persistent room, OR when a topic deserves a dedicated thread that other teammates should see. Returns the channel id and surface card.",
      inputSchema: z.object({
        name: z.string().min(1).max(80).describe("Short channel name. Examples: 'oak-ave-deal', 'q3-routing-review', 'dm-with-sarah'."),
        kind: z.enum(["channel", "dm", "group"]).default("channel").describe("'channel' for open team rooms, 'dm' for one-on-one, 'group' for ad-hoc groups."),
        description: z.string().max(500).optional().describe("Why this room exists. Shown in the channel header."),
        memberIds: z.array(z.string().uuid()).max(40).default([]).describe("workspace_member ids to invite. Harwick is always implicit; the requesting operator is auto-added."),
        kickoffMessage: z.string().max(2000).optional().describe("If provided, Harwick posts this as the first message in the new channel so the room isn't empty."),
      }),
      async execute({ name, kind, description, memberIds, kickoffMessage }) {
        if (!canSpawnChannels(deps.operatorRole)) {
          return {
            kind: "channel_card",
            created: false,
            error: "This role is read-only and cannot create channels.",
          };
        }

        const parsed = HarwickChannelCreateSchema.safeParse({ name, kind, description, memberIds });
        if (!parsed.success) {
          return {
            kind: "channel_card",
            created: false,
            error: `Could not create channel: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          };
        }

        const { data: channel, error: channelError } = await deps.supabase
          .from("harwick_channels")
          .insert({
            workspace_id: deps.workspaceId,
            kind: parsed.data.kind,
            name: parsed.data.name,
            description: parsed.data.description ?? null,
            created_by_member_id: deps.operatorMemberId,
            created_by_kind: "harwick",
          })
          .select("id, name, kind, description, created_at")
          .single();

        if (channelError !== null || channel === null) {
          return { kind: "channel_card", created: false, error: channelError?.message ?? "create_failed" };
        }

        const allMemberIds = Array.from(new Set([deps.operatorMemberId, ...parsed.data.memberIds]));
        const memberRows = allMemberIds.map((memberId) => ({
          channel_id: channel.id,
          member_id: memberId,
          workspace_id: deps.workspaceId,
        }));
        await deps.supabase.from("harwick_channel_members").insert(memberRows);

        let kickoffMessageId: string | null = null;
        if (kickoffMessage !== undefined && kickoffMessage.trim().length > 0) {
          const { data: kickoff } = await deps.supabase
            .from("harwick_channel_messages")
            .insert({
              channel_id: channel.id,
              workspace_id: deps.workspaceId,
              author_kind: "harwick",
              author_member_id: null,
              body: kickoffMessage.trim(),
              mentions_harwick: false,
              metadata: { trigger: "channel_kickoff" },
            })
            .select("id")
            .single();
          kickoffMessageId = (kickoff as { id: string } | null)?.id ?? null;
        }

        return {
          kind: "channel_card",
          created: true,
          channelId: channel.id,
          name: channel.name,
          channelKind: channel.kind,
          description: channel.description,
          memberCount: allMemberIds.length,
          kickoffMessageId,
          openChannelHref: `/channels/${channel.id}`,
        };
      },
    }),

    // Post a Harwick message into a specific channel. Useful when Harwick wants
    // to follow up on a previous channel, drop an update, or react to background
    // work. Mentions @harwick? No — Harwick posting itself doesn't re-mention.
    post_channel_message: tool({
      description: "Post a message into an existing channel as Harwick. Use this to follow up on a room (status update, drafted reply, FYI). Never use this to reply in the same channel that's already invoking you — that goes through the normal reply flow.",
      inputSchema: z.object({
        channelId: z.string().uuid().describe("Channel id to post into."),
        body: z.string().min(1).max(8000).describe("Message body. Plain text; use simple formatting."),
      }),
      async execute({ channelId, body }) {
        if (!canSpawnChannels(deps.operatorRole)) {
          return { kind: "channel_message", posted: false, error: "This role is read-only and cannot post messages." };
        }

        // Confirm the operator is a member of the target channel (otherwise
        // Harwick could leak across rooms when invoked from elsewhere).
        const { data: membership } = await deps.supabase
          .from("harwick_channel_members")
          .select("channel_id")
          .eq("workspace_id", deps.workspaceId)
          .eq("channel_id", channelId)
          .eq("member_id", deps.operatorMemberId)
          .maybeSingle();
        if (membership === null) {
          return { kind: "channel_message", posted: false, error: "Operator is not a member of that channel." };
        }

        const mentionsHarwick = detectHarwickMention(body);
        const { data, error } = await deps.supabase
          .from("harwick_channel_messages")
          .insert({
            channel_id: channelId,
            workspace_id: deps.workspaceId,
            author_kind: "harwick",
            author_member_id: null,
            body,
            mentions_harwick: mentionsHarwick,
            metadata: { trigger: "tool_post" },
          })
          .select("id, created_at")
          .single();
        if (error !== null || data === null) {
          return { kind: "channel_message", posted: false, error: error?.message ?? "insert_failed" };
        }

        const nowIso = new Date().toISOString();
        await deps.supabase
          .from("harwick_channels")
          .update({ last_message_at: nowIso, updated_at: nowIso })
          .eq("id", channelId);

        return {
          kind: "channel_message",
          posted: true,
          channelId,
          messageId: data.id,
          createdAt: data.created_at,
          openChannelHref: `/channels/${channelId}`,
        };
      },
    }),

    // Web search — provider-managed (OpenAI hosted). Harwick can use this when
    // it needs facts beyond the workspace: market trends, neighborhood data,
    // mortgage rate changes, comparable listings, etc. If the openai provider
    // wasn't supplied to buildHarwickChatTools (e.g. in tests), web_search is
    // omitted; the model won't see it and won't try to call it.
    ...(deps.openai === undefined
      ? {}
      : { web_search: deps.openai.tools.webSearchPreview({}) }),
  };
}
