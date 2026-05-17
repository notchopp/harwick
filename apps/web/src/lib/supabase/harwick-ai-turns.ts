import {
  HarwickAiAutomationPolicySchema,
  HarwickAiPersistedTurnSchema,
  HarwickAiTurnSchema,
  HarwickAiAutomationDecisionSchema,
  type HarwickAiAutomationPolicy,
  type HarwickAiPersistedTurn,
  type HarwickAiTurn,
  type HarwickAiAutomationDecision,
} from "@realty-ops/core";
import type {
  HarwickAiAutomationPolicyRow,
  HarwickAiToolCallInsertRow,
  HarwickAiTurnInsertRow,
  Json,
} from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";
import { checkPlanCapacity, recordBillingUsageEvent, recordCurrentPeriodUsageEvent } from "./billing";

export type HarwickAiTurnPersistenceRepository = {
  insertTurn(params: HarwickAiPersistedTurn): Promise<{ turnId: string }>;
  getTurnById(turnId: string): Promise<{ turn: HarwickAiTurn; automationDecision: HarwickAiAutomationDecision } | null>;
  updateTurnStatus(turnId: string, status: string): Promise<void>;
};

export type HarwickAiAutomationPolicyRepository = {
  resolveEffectivePolicy(params: {
    workspaceId: string;
    memberId: string | null;
    leadId: string | null;
  }): Promise<HarwickAiAutomationPolicy>;
};

function toJsonObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function recordHarwickTurnUsageSafely(
  supabase: RealtyOpsSupabaseClient,
  params: {
    workspaceId: string;
    turnId: string;
    channel: string;
    status: string;
    toolNames: string[];
    agentTrajectoryId: string | null;
  },
): Promise<void> {
  try {
    if (params.status !== "failed") {
      const idempotencyKey = params.agentTrajectoryId === null
        ? `harwick_turn:${params.turnId}`
        : `harwick_trajectory:${params.agentTrajectoryId}`;
      const capacity = await checkPlanCapacity(supabase, {
        workspaceId: params.workspaceId,
        eventType: "social_turn",
      });
      await recordBillingUsageEvent(supabase, {
        workspaceId: params.workspaceId,
        eventType: "social_turn",
        sourceId: params.agentTrajectoryId ?? params.turnId,
        idempotencyKey,
        retailCents: capacity.retailCents,
        cogsCents: capacity.cogsCents,
        eventMetadata: {
          channel: params.channel,
          status: params.status,
          tools: params.toolNames,
          turnId: params.turnId,
        },
      });
    }

    await recordCurrentPeriodUsageEvent(supabase, {
      workspaceId: params.workspaceId,
      eventType: "ai_turn",
      resourceId: params.turnId,
      eventMetadata: {
        channel: params.channel,
        status: params.status,
        tools: params.toolNames,
      },
    });

    if (params.status === "auto_executed") {
      await recordCurrentPeriodUsageEvent(supabase, {
        workspaceId: params.workspaceId,
        eventType: "ai_message_sent",
        resourceId: params.turnId,
        eventMetadata: {
          channel: params.channel,
          tools: params.toolNames,
        },
      });
    }
  } catch (error) {
    console.error("[harwick-ai-turns] failed to record usage event:", error);
  }
}

export function createSupabaseHarwickAiTurnRepository(
  supabase: RealtyOpsSupabaseClient,
): HarwickAiTurnPersistenceRepository {
  return {
    async insertTurn(params) {
      const parsed = HarwickAiPersistedTurnSchema.parse(params);
      const turnRow: HarwickAiTurnInsertRow = {
        workspace_id: parsed.workspaceId,
        lead_id: parsed.leadId,
        social_reply_review_id: parsed.socialReplyReviewId,
        provider_thread_id: parsed.providerThreadId,
        channel: parsed.channel,
        runtime_input: toJsonObject(parsed.runtimeInput) as Json,
        turn: toJsonObject(parsed.turn) as Json,
        automation_policy: toJsonObject(parsed.automationPolicy) as Json,
        automation_decision: toJsonObject(parsed.automationDecision) as Json,
        status: parsed.status,
        confidence: parsed.turn.confidence,
        next_action: parsed.turn.nextAction,
        reply: parsed.turn.reply,
        safety_flags: parsed.turn.safetyFlags,
        missing_fields: parsed.turn.missingFields,
        state_patch: toJsonObject(parsed.turn.statePatch) as Json,
        handoff_brief: parsed.turn.handoffBrief,
      };

      const { data, error } = await supabase
        .from("harwick_ai_turns")
        .insert(turnRow)
        .select("id")
        .single<{ id: string }>();

      if (error !== null) {
        throw error;
      }

      const toolRows: HarwickAiToolCallInsertRow[] = parsed.toolCalls.map((toolCall) => ({
        workspace_id: parsed.workspaceId,
        turn_id: data.id,
        lead_id: parsed.leadId,
        tool: toolCall.tool,
        requires_approval: toolCall.requiresApproval,
        reason: toolCall.reason,
        payload: toJsonObject(toolCall.payload) as Json,
        policy_status: toolCall.policyStatus,
        execution_status: toolCall.executionStatus,
        execution_output: toJsonObject(toolCall.executionOutput) as Json,
        error_code: toolCall.errorCode,
        error_message: toolCall.errorMessage,
        executed_at: toolCall.executionStatus === "executed" ? new Date().toISOString() : null,
      }));

      if (toolRows.length > 0) {
        const { error: toolError } = await supabase
          .from("harwick_ai_tool_calls")
          .insert(toolRows);

        if (toolError !== null) {
          throw toolError;
        }
      }

      await recordHarwickTurnUsageSafely(supabase, {
        workspaceId: parsed.workspaceId,
        turnId: data.id,
        channel: parsed.channel,
        status: parsed.status,
        toolNames: parsed.toolCalls.map((toolCall) => toolCall.tool),
        agentTrajectoryId: parsed.agentTrajectoryId,
      });

      return { turnId: data.id };
    },
    async getTurnById(turnId: string) {
      const { data, error } = await supabase
        .from("harwick_ai_turns")
        .select("turn, automation_decision")
        .eq("id", turnId)
        .single<{ turn: unknown; automation_decision: unknown }>();

      if (error !== null || !data) {
        return null;
      }

      const turn = HarwickAiTurnSchema.parse(data.turn);
      const automationDecision = HarwickAiAutomationDecisionSchema.parse(data.automation_decision);

      return {
        turn,
        automationDecision,
      };
    },
    async updateTurnStatus(turnId: string, status: string) {
      const validStatuses = ["failed", "blocked", "drafted", "auto_executed", "queued_for_approval"] as const;
      if (!validStatuses.includes(status as typeof validStatuses[number])) {
        throw new Error(`Invalid status: ${status}`);
      }
      const { error } = await supabase
        .from("harwick_ai_turns")
        .update({ status: status as typeof validStatuses[number] })
        .eq("id", turnId);

      if (error !== null) {
        throw error;
      }
    },
  };
}

function mapPolicyRow(row: HarwickAiAutomationPolicyRow): HarwickAiAutomationPolicy {
  return HarwickAiAutomationPolicySchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    memberId: row.member_id,
    leadId: row.lead_id,
    scope: row.scope,
    automationMode: row.automation_mode,
    autoSendEnabled: row.auto_send_enabled,
    confidenceThreshold: Number(row.confidence_threshold),
    allowedAutoActions: row.allowed_auto_actions,
    allowedAutoTools: row.allowed_auto_tools,
    requiresApprovalActions: row.requires_approval_actions,
    requiresApprovalTools: row.requires_approval_tools,
    blockedSafetyFlags: row.blocked_safety_flags,
  });
}

export function createSupabaseHarwickAiAutomationPolicyRepository(
  supabase: RealtyOpsSupabaseClient,
): HarwickAiAutomationPolicyRepository {
  return {
    async resolveEffectivePolicy(params) {
      const [policyResult, stateResult] = await Promise.all([
        supabase
          .from("harwick_ai_automation_policies")
          .select("*")
          .eq("workspace_id", params.workspaceId)
          .or(`lead_id.eq.${params.leadId ?? "00000000-0000-0000-0000-000000000000"},member_id.eq.${params.memberId ?? "00000000-0000-0000-0000-000000000000"},scope.eq.workspace`)
          .returns<HarwickAiAutomationPolicyRow[]>(),
        params.leadId === null
          ? Promise.resolve({ data: null, error: null })
          : supabase
              .from("conversation_automation_states")
              .select("automation_mode, automation_reason")
              .eq("workspace_id", params.workspaceId)
              .eq("lead_id", params.leadId)
              .maybeSingle<{ automation_mode: "ai_on" | "human_takeover" | "paused_by_rule"; automation_reason: string | null }>(),
      ]);

      if (policyResult.error !== null) {
        throw policyResult.error;
      }
      if (stateResult.error !== null) {
        throw stateResult.error;
      }

      const rows = policyResult.data ?? [];
      const conversationState = stateResult.data ?? null;

      const basePolicy = (() => {
        const conversationPolicy = params.leadId === null
          ? undefined
          : rows.find((row) => row.scope === "conversation" && row.lead_id === params.leadId);
        if (conversationPolicy !== undefined) {
          return mapPolicyRow(conversationPolicy);
        }

        const memberPolicy = params.memberId === null
          ? undefined
          : rows.find((row) => row.scope === "member" && row.member_id === params.memberId);
        if (memberPolicy !== undefined) {
          return mapPolicyRow(memberPolicy);
        }

        const workspacePolicy = rows.find((row) => row.scope === "workspace");
        if (workspacePolicy !== undefined) {
          return mapPolicyRow(workspacePolicy);
        }

        return HarwickAiAutomationPolicySchema.parse({
          workspaceId: params.workspaceId,
          memberId: params.memberId,
          leadId: params.leadId,
          scope: params.leadId === null ? "workspace" : "conversation",
          automationMode: "ai_on",
        });
      })();

      // Per-conversation pause is the source of truth: if an operator paused
      // this thread via the UI, override the policy mode so the runtime
      // does not auto-execute. Other threads in this workspace are unaffected.
      if (conversationState !== null && conversationState.automation_mode !== "ai_on") {
        return HarwickAiAutomationPolicySchema.parse({
          ...basePolicy,
          automationMode: conversationState.automation_mode,
        });
      }

      return basePolicy;
    },
  };
}
