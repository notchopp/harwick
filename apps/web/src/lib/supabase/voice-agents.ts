import type {
  ProvisionWorkspaceVoiceAgentRequest,
  ProvisionWorkspaceVoiceAgentResponse,
  RetellCallContextResponse,
  VoiceAgentStatus,
} from "@realty-ops/core";
import { buildRealtyVoiceAliases, buildRealtyVoiceContract, normalizeUsPhoneNumber } from "@realty-ops/core";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type WorkspaceVoiceAgentRow = {
  id: string;
  workspace_id: string;
  account_scope: "workspace" | "member";
  owner_member_id: string | null;
  provider: "retell";
  status: VoiceAgentStatus;
  retell_agent_id: string | null;
  retell_conversation_flow_id: string | null;
  retell_phone_number_id: string | null;
  phone_number: string | null;
  service_areas: string[];
  transfer_number: string | null;
  template_version: string;
  published_config_hash: string | null;
  webhook_url: string | null;
  dynamic_variables_webhook_url: string | null;
  last_synced_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkspaceRowForVoiceProvisioning = {
  id: string;
  name: string;
};

export type VoiceAgentOwnership = {
  accountScope: WorkspaceVoiceAgentRow["account_scope"];
  ownerMemberId: string | null;
};

export type VoiceAgentProvisionedAsset = {
  conversationFlowId: string;
  agentId: string;
  retellPhoneNumberId: string | null;
  phoneNumber: string | null;
  webhookUrl: string;
  dynamicVariablesWebhookUrl: string;
  created: boolean;
};

export type WorkspaceVoiceAgentContextRow = {
  workspace: WorkspaceRowForVoiceProvisioning;
  voiceAgent: WorkspaceVoiceAgentRow;
  callerLead: {
    leadId: string;
    callerName: string | null;
    leadType: "buyer" | "seller" | "renter" | "investor" | "unknown";
    targetArea: string | null;
    timeline: string | null;
    budget: string | null;
    financingStatus: "preapproved" | "cash" | "needs_lender" | "unknown";
    memorySummary: string | null;
    preferredTransferNumber: string | null;
  } | null;
};

const usdIntegerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

function formatUsdInteger(value: number): string {
  return usdIntegerFormatter.format(value);
}

function formatLeadBudgetSummary(params: {
  min: number | null;
  max: number | null;
}): string | null {
  if (params.min === null && params.max === null) {
    return null;
  }

  if (params.min !== null && params.max !== null) {
    return params.min === params.max
      ? `$${formatUsdInteger(params.min)}`
      : `$${formatUsdInteger(params.min)}-$${formatUsdInteger(params.max)}`;
  }

  return params.min !== null
    ? `From $${formatUsdInteger(params.min)}`
    : `Up to $${formatUsdInteger(params.max ?? 0)}`;
}

export type VoiceAgentRepository = {
  getWorkspace(workspaceId: string): Promise<WorkspaceRowForVoiceProvisioning | null>;
  getWorkspaceVoiceAgent(workspaceId: string, ownership?: VoiceAgentOwnership): Promise<WorkspaceVoiceAgentRow | null>;
  getWorkspaceVoiceAgentByRetellAgentId(params: {
    retellAgentId: string;
    fromNumber?: string | null;
  }): Promise<WorkspaceVoiceAgentContextRow | null>;
  markProvisioning(params: {
    workspaceId: string;
    ownership: VoiceAgentOwnership;
    setup: Pick<ProvisionWorkspaceVoiceAgentRequest, "serviceAreas" | "transferNumber">;
  }): Promise<WorkspaceVoiceAgentRow>;
  markActive(params: {
    workspaceId: string;
    ownership: VoiceAgentOwnership;
    setup: Pick<ProvisionWorkspaceVoiceAgentRequest, "serviceAreas" | "transferNumber">;
    asset: VoiceAgentProvisionedAsset;
  }): Promise<ProvisionWorkspaceVoiceAgentResponse>;
  markError(params: {
    workspaceId: string;
    ownership: VoiceAgentOwnership;
    errorCode: string;
    errorMessage: string;
  }): Promise<void>;
};

export function buildRetellCallContextResponse(
  row: WorkspaceVoiceAgentContextRow,
  call: {
    fromNumber?: string | null;
    toNumber?: string | null;
  } = {},
): RetellCallContextResponse {
  if (row.voiceAgent.retell_agent_id === null) {
    throw new Error("Active voice agent is missing a Retell agent ID.");
  }

  const serviceAreas = row.voiceAgent.service_areas.length > 0
    ? row.voiceAgent.service_areas.join(", ")
    : "Ask for the buyer or seller's target area.";
  const knownCallerName = row.callerLead?.callerName ?? "";
  const budgetSummary = row.callerLead?.budget ?? "";
  const transferNumber = row.callerLead?.preferredTransferNumber ?? row.voiceAgent.transfer_number ?? "";
  const memorySummary = row.callerLead?.memorySummary ?? "No prior lead history loaded yet.";

  const contract = buildRealtyVoiceContract({
    workspaceId: row.workspace.id,
    workspaceName: row.workspace.name,
    serviceAreas: row.voiceAgent.service_areas,
    transferNumber,
    retellAgentId: row.voiceAgent.retell_agent_id,
    fromNumber: call.fromNumber ?? "",
    toNumber: call.toNumber ?? "",
    callerName: knownCallerName,
    memorySummary,
  });
  const aliases = buildRealtyVoiceAliases(contract);

  return {
    workspace_id: row.workspace.id,
    workspace_name: row.workspace.name,
    retell_agent_id: row.voiceAgent.retell_agent_id,
    lead_id: row.callerLead?.leadId ?? "",
    service_areas: serviceAreas,
    transfer_number: transferNumber,
    caller_name: knownCallerName,
    lead_type: row.callerLead?.leadType ?? "unknown",
    target_area: row.callerLead?.targetArea ?? "",
    timeline: row.callerLead?.timeline ?? "",
    budget: budgetSummary,
    financing_status: row.callerLead?.financingStatus ?? "unknown",
    from_number: call.fromNumber ?? "",
    to_number: call.toNumber ?? "",
    memory_summary: memorySummary,
    next_action: knownCallerName.length > 0
      ? "Acknowledge prior context, confirm what changed, then decide whether to qualify further or transfer."
      : "Listen first, identify the real estate intent, then qualify naturally.",
    ...aliases,
  };
}

export function createSupabaseVoiceAgentRepository(
  supabase: RealtyOpsSupabaseClient,
): VoiceAgentRepository {
  async function findVoiceAgentId(params: {
    workspaceId: string;
    ownership: VoiceAgentOwnership;
  }): Promise<string | null> {
    let query = supabase
      .from("workspace_voice_agents")
      .select("id")
      .eq("workspace_id", params.workspaceId)
      .eq("provider", "retell")
      .eq("account_scope", params.ownership.accountScope)
      .limit(1);

    if (params.ownership.accountScope === "member") {
      if (params.ownership.ownerMemberId === null) {
        return null;
      }
      query = query.eq("owner_member_id", params.ownership.ownerMemberId);
    } else {
      query = query.is("owner_member_id", null);
    }

    const { data, error } = await query.maybeSingle<Pick<WorkspaceVoiceAgentRow, "id">>();

    if (error !== null) {
      throw error;
    }

    return data?.id ?? null;
  }

  async function writeWorkspaceVoiceAgent(params: {
    workspaceId: string;
    ownership: VoiceAgentOwnership;
    row: Omit<Partial<WorkspaceVoiceAgentRow>, "id" | "workspace_id" | "account_scope" | "owner_member_id" | "provider">;
  }): Promise<WorkspaceVoiceAgentRow> {
    const existingId = await findVoiceAgentId({
      workspaceId: params.workspaceId,
      ownership: params.ownership,
    });

    const baseRow = {
      workspace_id: params.workspaceId,
      account_scope: params.ownership.accountScope,
      owner_member_id: params.ownership.ownerMemberId,
      provider: "retell" as const,
      ...params.row,
    };

    if (existingId !== null) {
      const { data, error } = await supabase
        .from("workspace_voice_agents")
        .update(baseRow)
        .eq("id", existingId)
        .select("*")
        .single<WorkspaceVoiceAgentRow>();

      if (error !== null) {
        throw error;
      }

      return data;
    }

    const { data, error } = await supabase
      .from("workspace_voice_agents")
      .insert(baseRow)
      .select("*")
      .single<WorkspaceVoiceAgentRow>();

    if (error !== null) {
      throw error;
    }

    return data;
  }

  return {
    async getWorkspace(workspaceId) {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id,name")
        .eq("id", workspaceId)
        .maybeSingle<WorkspaceRowForVoiceProvisioning>();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },

    async getWorkspaceVoiceAgent(workspaceId, ownership = { accountScope: "workspace", ownerMemberId: null }) {
      let query = supabase
        .from("workspace_voice_agents")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("provider", "retell")
        .eq("account_scope", ownership.accountScope);

      if (ownership.accountScope === "member") {
        if (ownership.ownerMemberId === null) {
          return null;
        }
        query = query.eq("owner_member_id", ownership.ownerMemberId);
      } else {
        query = query.is("owner_member_id", null);
      }

      const { data, error } = await query.maybeSingle<WorkspaceVoiceAgentRow>();

      if (error !== null) {
        throw error;
      }

      return data ?? null;
    },

    async getWorkspaceVoiceAgentByRetellAgentId(params) {
      const normalizedFromNumber = normalizeUsPhoneNumber(params.fromNumber);
      const { data, error } = await supabase
        .from("workspace_voice_agents")
        .select("*")
        .eq("provider", "retell")
        .eq("retell_agent_id", params.retellAgentId)
        .in("status", ["active", "needs_sync"])
        .maybeSingle<WorkspaceVoiceAgentRow>();

      if (error !== null) {
        throw error;
      }

      if (data === null) {
        return null;
      }

      const { data: workspace, error: workspaceError } = await supabase
        .from("workspaces")
        .select("id,name")
        .eq("id", data.workspace_id)
        .maybeSingle<WorkspaceRowForVoiceProvisioning>();

      if (workspaceError !== null) {
        throw workspaceError;
      }

      if (workspace === null) {
        return null;
      }

      let callerLead: WorkspaceVoiceAgentContextRow["callerLead"] = null;
      if (normalizedFromNumber !== null) {
        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .select("id,full_name,lead_type,target_area,timeline,budget_min,budget_max,financing_status,status,score,assigned_agent_id")
          .eq("workspace_id", data.workspace_id)
          .eq("phone", normalizedFromNumber)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle<{
            id: string;
            full_name: string | null;
            lead_type: "buyer" | "seller" | "renter" | "investor" | "unknown";
            target_area: string | null;
            timeline: string | null;
            budget_min: number | null;
            budget_max: number | null;
            financing_status: "preapproved" | "cash" | "needs_lender" | "unknown";
            status: string;
            score: number;
            assigned_agent_id: string | null;
          }>();

        if (leadError !== null) {
          throw leadError;
        }

        if (lead !== null) {
          let preferredTransferNumber: string | null = null;
          if (lead.assigned_agent_id !== null) {
            const { data: assignedVoiceAgent, error: assignedVoiceAgentError } = await supabase
              .from("workspace_voice_agents")
              .select("transfer_number")
              .eq("workspace_id", data.workspace_id)
              .eq("provider", "retell")
              .eq("account_scope", "member")
              .eq("owner_member_id", lead.assigned_agent_id)
              .in("status", ["active", "needs_sync"])
              .maybeSingle<Pick<WorkspaceVoiceAgentRow, "transfer_number">>();

            if (assignedVoiceAgentError !== null) {
              throw assignedVoiceAgentError;
            }

            preferredTransferNumber = assignedVoiceAgent?.transfer_number ?? null;
          }

          const budget = formatLeadBudgetSummary({
            min: lead.budget_min,
            max: lead.budget_max,
          });

          callerLead = {
            leadId: lead.id,
            callerName: lead.full_name,
            leadType: lead.lead_type,
            targetArea: lead.target_area,
            timeline: lead.timeline,
            budget,
            financingStatus: lead.financing_status,
            memorySummary: [
              "Known caller on file.",
              lead.lead_type === "unknown" ? "" : `${lead.lead_type} lead.`,
              `Status: ${lead.status}.`,
              `Score: ${lead.score}.`,
              lead.target_area === null ? "" : `Area: ${lead.target_area}.`,
              lead.timeline === null ? "" : `Timeline: ${lead.timeline}.`,
            ].filter((part) => part.length > 0).join(" "),
            preferredTransferNumber,
          };
        }
      }

      return {
        workspace,
        voiceAgent: data,
        callerLead,
      };
    },

    async markProvisioning(params) {
      return writeWorkspaceVoiceAgent({
        workspaceId: params.workspaceId,
        ownership: params.ownership,
        row: {
          status: "provisioning",
          service_areas: params.setup.serviceAreas,
          transfer_number: params.setup.transferNumber,
          template_version: "realty_voice_v1",
          updated_at: new Date().toISOString(),
        },
      });
    },

    async markActive(params) {
      const now = new Date().toISOString();
      const data = await writeWorkspaceVoiceAgent({
        workspaceId: params.workspaceId,
        ownership: params.ownership,
        row: {
          status: "active",
          retell_agent_id: params.asset.agentId,
          retell_conversation_flow_id: params.asset.conversationFlowId,
          retell_phone_number_id: params.asset.retellPhoneNumberId,
          phone_number: params.asset.phoneNumber,
          service_areas: params.setup.serviceAreas,
          transfer_number: params.setup.transferNumber,
          webhook_url: params.asset.webhookUrl,
          dynamic_variables_webhook_url: params.asset.dynamicVariablesWebhookUrl,
          template_version: "realty_voice_v1",
          last_synced_at: now,
          last_error_code: null,
          last_error_message: null,
          updated_at: now,
        },
      });

      if (
        data.retell_agent_id === null ||
        data.retell_conversation_flow_id === null ||
        data.status !== "active"
      ) {
        throw new Error("Voice agent activation did not return active Retell asset IDs.");
      }

      return {
        workspaceId: data.workspace_id,
        voiceAgentId: data.id,
        retellAgentId: data.retell_agent_id,
        retellConversationFlowId: data.retell_conversation_flow_id,
        phoneNumber: data.phone_number,
        status: "active",
        created: params.asset.created,
      };
    },

    async markError(params) {
      await writeWorkspaceVoiceAgent({
        workspaceId: params.workspaceId,
        ownership: params.ownership,
        row: {
          status: "error",
          template_version: "realty_voice_v1",
          last_error_code: params.errorCode,
          last_error_message: params.errorMessage.slice(0, 1000),
          updated_at: new Date().toISOString(),
        },
      });
    },
  };
}
