import {
  ProvisionWorkspaceVoiceAgentRequestSchema,
  ProvisionWorkspaceVoiceAgentResponseSchema,
  type ProvisionWorkspaceVoiceAgentRequest,
  type ProvisionWorkspaceVoiceAgentResponse,
  type ServerEnvironment,
} from "@realty-ops/core";
import {
  createRetellProvisioningClient,
  provisionRealtyRetellAgent,
  type RetellProvisioningClientOptions,
} from "@realty-ops/integrations";
import type { VoiceAgentRepository } from "../../lib/supabase/voice-agents";

export type ProvisionWorkspaceVoiceAgentDependencies = {
  repository: VoiceAgentRepository;
  environment: ServerEnvironment;
  fetchImpl?: typeof fetch;
};

export type ProvisionWorkspaceVoiceAgentResult =
  | {
      ok: true;
      status: 200;
      body: ProvisionWorkspaceVoiceAgentResponse;
    }
  | {
      ok: false;
      status: 400 | 404 | 500;
      body: {
        error: "invalid_request" | "workspace_not_found" | "missing_retell_config" | "provisioning_failed";
      };
    };

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function resolveRequiredProvisioningConfig(params: {
  environment: ServerEnvironment;
  request: ProvisionWorkspaceVoiceAgentRequest;
}): { templateFlowId?: string; voiceId: string } | null {
  const templateFlowId = params.request.templateFlowId ?? params.environment.RETELL_CONVERSATION_FLOW_TEMPLATE_ID;
  const voiceId = params.request.voiceId ?? params.environment.RETELL_VOICE_ID;

  if (!voiceId) {
    return null;
  }

  if (templateFlowId === undefined) {
    return { voiceId };
  }

  return { templateFlowId, voiceId };
}

export async function provisionWorkspaceVoiceAgent(params: {
  workspaceId: string;
  request: unknown;
  dependencies: ProvisionWorkspaceVoiceAgentDependencies;
}): Promise<ProvisionWorkspaceVoiceAgentResult> {
  const parsedRequest = ProvisionWorkspaceVoiceAgentRequestSchema.safeParse(params.request);
  if (!parsedRequest.success) {
    return {
      ok: false,
      status: 400,
      body: { error: "invalid_request" },
    };
  }

  const requiredConfig = resolveRequiredProvisioningConfig({
    environment: params.dependencies.environment,
    request: parsedRequest.data,
  });

  if (requiredConfig === null) {
    return {
      ok: false,
      status: 500,
      body: { error: "missing_retell_config" },
    };
  }

  const workspace = await params.dependencies.repository.getWorkspace(params.workspaceId);
  if (workspace === null) {
    return {
      ok: false,
      status: 404,
      body: { error: "workspace_not_found" },
    };
  }

  const ownership = {
    accountScope: parsedRequest.data.accountScope,
    ownerMemberId: parsedRequest.data.ownerMemberId,
  };
  const existingVoiceAgent = await params.dependencies.repository.getWorkspaceVoiceAgent(
    params.workspaceId,
    ownership,
  );
  await params.dependencies.repository.markProvisioning({
    workspaceId: params.workspaceId,
    ownership,
    setup: {
      serviceAreas: parsedRequest.data.serviceAreas,
      transferNumber: parsedRequest.data.transferNumber,
    },
  });

  const voiceWebhookBaseUrl = trimTrailingSlash(params.dependencies.environment.NEXT_PUBLIC_APP_URL);
  const dynamicVariablesBaseUrl = trimTrailingSlash(params.dependencies.environment.NEXT_PUBLIC_APP_URL);

  try {
    const clientOptions: RetellProvisioningClientOptions = {
      apiKey: params.dependencies.environment.RETELL_API_KEY,
    };
    if (params.dependencies.fetchImpl !== undefined) {
      clientOptions.fetchImpl = params.dependencies.fetchImpl;
    }

    const provisioningConfig = {
      workspaceId: params.workspaceId,
      workspaceName: workspace.name,
      timezone: "America/New_York",
      serviceAreas: parsedRequest.data.serviceAreas,
      transferNumber: parsedRequest.data.transferNumber,
      voiceId: requiredConfig.voiceId,
      voiceWebhookBaseUrl,
      dynamicVariablesBaseUrl,
      ...(requiredConfig.templateFlowId === undefined ? {} : { templateFlowId: requiredConfig.templateFlowId }),
    };

    const provisionedAsset = await provisionRealtyRetellAgent({
      client: createRetellProvisioningClient(clientOptions),
      config: provisioningConfig,
      existingRetellAgentId: existingVoiceAgent?.retell_agent_id ?? null,
      existingRetellConversationFlowId: existingVoiceAgent?.retell_conversation_flow_id ?? null,
      existingPhoneNumber: existingVoiceAgent?.phone_number ?? null,
    });

    const response = await params.dependencies.repository.markActive({
      workspaceId: params.workspaceId,
      ownership,
      setup: {
        serviceAreas: parsedRequest.data.serviceAreas,
        transferNumber: parsedRequest.data.transferNumber,
      },
      asset: {
        conversationFlowId: provisionedAsset.conversationFlowId,
        agentId: provisionedAsset.agentId,
        retellPhoneNumberId: provisionedAsset.retellPhoneNumberId,
        phoneNumber: provisionedAsset.phoneNumber,
        webhookUrl: `${voiceWebhookBaseUrl}/api/retell/webhook`,
        dynamicVariablesWebhookUrl: `${dynamicVariablesBaseUrl}/api/retell/context`,
        created: provisionedAsset.created,
      },
    });

    return {
      ok: true,
      status: 200,
      body: ProvisionWorkspaceVoiceAgentResponseSchema.parse(response),
    };
  } catch (error) {
    await params.dependencies.repository.markError({
      workspaceId: params.workspaceId,
      ownership,
      errorCode: "retell_provisioning_failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });

    return {
      ok: false,
      status: 500,
      body: { error: "provisioning_failed" },
    };
  }
}
