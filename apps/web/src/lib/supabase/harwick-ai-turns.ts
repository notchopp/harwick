import {
  HarwickAiAutomationPolicySchema,
  HarwickAiPersistedTurnSchema,
  type HarwickAiAutomationPolicy,
  type HarwickAiPersistedTurn,
} from "@realty-ops/core";
import type {
  HarwickAiAutomationPolicyRow,
  HarwickAiToolCallInsertRow,
  HarwickAiTurnInsertRow,
} from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type HarwickAiTurnPersistenceRepository = {
  insertTurn(params: HarwickAiPersistedTurn): Promise<{ turnId: string }>;
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
        runtime_input: toJsonObject(parsed.runtimeInput),
        turn: toJsonObject(parsed.turn),
        automation_policy: toJsonObject(parsed.automationPolicy),
        automation_decision: toJsonObject(parsed.automationDecision),
        status: parsed.status,
        confidence: parsed.turn.confidence,
        next_action: parsed.turn.nextAction,
        reply: parsed.turn.reply,
        safety_flags: parsed.turn.safetyFlags,
        missing_fields: parsed.turn.missingFields,
        state_patch: toJsonObject(parsed.turn.statePatch),
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
        payload: toJsonObject(toolCall.payload),
        policy_status: toolCall.policyStatus,
        execution_status: toolCall.executionStatus,
        execution_output: toJsonObject(toolCall.executionOutput),
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

      return { turnId: data.id };
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
      const { data, error } = await supabase
        .from("harwick_ai_automation_policies")
        .select("*")
        .eq("workspace_id", params.workspaceId)
        .or(`lead_id.eq.${params.leadId ?? "00000000-0000-0000-0000-000000000000"},member_id.eq.${params.memberId ?? "00000000-0000-0000-0000-000000000000"},scope.eq.workspace`)
        .returns<HarwickAiAutomationPolicyRow[]>();

      if (error !== null) {
        throw error;
      }

      const rows = data ?? [];
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
    },
  };
}
