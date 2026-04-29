import { describe, expect, it, vi } from "vitest";
import type { ServerEnvironment } from "@realty-ops/core";
import type {
  VoiceAgentProvisionedAsset,
  VoiceAgentRepository,
  WorkspaceVoiceAgentRow,
} from "../../lib/supabase/voice-agents";
import { provisionWorkspaceVoiceAgent } from "./provision-workspace-voice-agent";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const voiceAgentId = "123e4567-e89b-12d3-a456-426614174001";

const environment: ServerEnvironment = {
  APP_ENV: "development",
  NEXT_PUBLIC_APP_URL: "https://app.example.com",
  META_APP_ID: "meta-app",
  META_APP_SECRET: "meta-secret",
  META_WEBHOOK_VERIFY_TOKEN: "verify-token-long-enough",
  RETELL_API_KEY: "retell-api-key",
  RETELL_CONVERSATION_FLOW_TEMPLATE_ID: "conversation_flow_template",
  RETELL_VOICE_ID: "voice_realty",
  OPENAI_REPLY_MODEL: "gpt-5.2",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

function createResponse(params: {
  ok?: boolean;
  status?: number;
  body?: unknown;
  text?: string;
}) {
  return {
    ok: params.ok ?? true,
    status: params.status ?? 200,
    json: vi.fn().mockResolvedValue(params.body ?? {}),
    text: vi.fn().mockResolvedValue(params.text ?? ""),
  } as unknown as Response;
}

function readRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

function createWorkspaceVoiceAgentRow(
  overrides: Partial<WorkspaceVoiceAgentRow> = {},
): WorkspaceVoiceAgentRow {
  return {
    id: voiceAgentId,
    workspace_id: workspaceId,
    account_scope: "workspace",
    owner_member_id: null,
    provider: "retell",
    status: "provisioning",
    retell_agent_id: null,
    retell_conversation_flow_id: null,
    retell_phone_number_id: null,
    phone_number: null,
    service_areas: [],
    transfer_number: null,
    template_version: "realty_voice_v1",
    published_config_hash: null,
    webhook_url: null,
    dynamic_variables_webhook_url: null,
    last_synced_at: null,
    last_error_code: null,
    last_error_message: null,
    created_at: "2026-04-28T00:00:00.000Z",
    updated_at: "2026-04-28T00:00:00.000Z",
    ...overrides,
  };
}

function createRepository(params: {
  workspace?: { id: string; name: string } | null;
  existingVoiceAgent?: WorkspaceVoiceAgentRow | null;
} = {}) {
  const workspace = "workspace" in params ? params.workspace : { id: workspaceId, name: "Houston Brokerage" };
  const getWorkspace = vi.fn<VoiceAgentRepository["getWorkspace"]>().mockResolvedValue(workspace);
  const getWorkspaceVoiceAgent = vi.fn<VoiceAgentRepository["getWorkspaceVoiceAgent"]>()
    .mockResolvedValue(params.existingVoiceAgent ?? null);
  const getWorkspaceVoiceAgentByRetellAgentId = vi.fn<VoiceAgentRepository["getWorkspaceVoiceAgentByRetellAgentId"]>()
    .mockResolvedValue(null);
  const markProvisioning = vi.fn<VoiceAgentRepository["markProvisioning"]>()
    .mockResolvedValue(createWorkspaceVoiceAgentRow());
  const markActive = vi.fn<VoiceAgentRepository["markActive"]>()
    .mockImplementation((activeParams: { workspaceId: string; asset: VoiceAgentProvisionedAsset }) => Promise.resolve({
      workspaceId: activeParams.workspaceId,
      voiceAgentId,
      retellAgentId: activeParams.asset.agentId,
      retellConversationFlowId: activeParams.asset.conversationFlowId,
      phoneNumber: activeParams.asset.phoneNumber,
      status: "active",
      created: activeParams.asset.created,
    }));
  const markError = vi.fn<VoiceAgentRepository["markError"]>().mockResolvedValue(undefined);

  return {
    repository: {
      getWorkspace,
      getWorkspaceVoiceAgent,
      getWorkspaceVoiceAgentByRetellAgentId,
      markProvisioning,
      markActive,
      markError,
    } satisfies VoiceAgentRepository,
    getWorkspace,
    getWorkspaceVoiceAgent,
    getWorkspaceVoiceAgentByRetellAgentId,
    markProvisioning,
    markActive,
    markError,
  };
}

describe("provisionWorkspaceVoiceAgent", () => {
  it("provisions a new Retell voice agent and stores active asset IDs", async () => {
    const { repository, markProvisioning, markActive } = createRepository();
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = readRequestUrl(input);
      if (url.endsWith("/get-conversation-flow/conversation_flow_template")) {
        return Promise.resolve(createResponse({
          body: {
            conversation_flow_id: "conversation_flow_template",
            version: 4,
            global_prompt: "Template",
            nodes: [],
          },
        }));
      }
      if (url.endsWith("/create-conversation-flow")) {
        return Promise.resolve(createResponse({ body: { conversation_flow_id: "conversation_flow_created" } }));
      }
      if (url.endsWith("/create-agent")) {
        return Promise.resolve(createResponse({ body: { agent_id: "agent_created" } }));
      }
      if (url.endsWith("/create-phone-number")) {
        return Promise.resolve(createResponse({ body: { phone_number: "+17135550123" } }));
      }
      return Promise.resolve(createResponse({ ok: false, status: 404, text: "not found" }));
    });

    const result = await provisionWorkspaceVoiceAgent({
      workspaceId,
      request: {
        serviceAreas: ["Houston", "Cypress"],
        transferNumber: "+17135550100",
      },
      dependencies: {
        repository,
        environment,
        fetchImpl,
      },
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      body: {
        workspaceId,
        voiceAgentId,
        retellAgentId: "agent_created",
        retellConversationFlowId: "conversation_flow_created",
        phoneNumber: "+17135550123",
        status: "active",
        created: true,
      },
    });
    expect(markProvisioning).toHaveBeenCalledWith({
      workspaceId,
      ownership: {
        accountScope: "workspace",
        ownerMemberId: null,
      },
      setup: {
        serviceAreas: ["Houston", "Cypress"],
        transferNumber: "+17135550100",
      },
    });
    expect(markActive).toHaveBeenCalledWith({
      workspaceId,
      ownership: {
        accountScope: "workspace",
        ownerMemberId: null,
      },
      setup: {
        serviceAreas: ["Houston", "Cypress"],
        transferNumber: "+17135550100",
      },
      asset: {
        agentId: "agent_created",
        conversationFlowId: "conversation_flow_created",
        retellPhoneNumberId: "+17135550123",
        phoneNumber: "+17135550123",
        webhookUrl: "https://app.example.com/api/retell/webhook",
        dynamicVariablesWebhookUrl: "https://app.example.com/api/retell/context",
        created: true,
      },
    });
    expect(fetchImpl).toHaveBeenCalledWith("https://api.retellai.com/create-agent", expect.objectContaining({
      body: expect.stringContaining("\"voice_id\":\"voice_realty\"") as string,
    }));
  });

  it("provisions member-owned Retell voice agents without using the workspace-shared slot", async () => {
    const ownerMemberId = "223e4567-e89b-12d3-a456-426614174000";
    const { repository, getWorkspaceVoiceAgent, markProvisioning } = createRepository();
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = readRequestUrl(input);
      if (url.endsWith("/get-conversation-flow/conversation_flow_template")) {
        return Promise.resolve(createResponse({
          body: {
            conversation_flow_id: "conversation_flow_template",
            version: 4,
            global_prompt: "Template",
            nodes: [],
          },
        }));
      }
      if (url.endsWith("/create-conversation-flow")) {
        return Promise.resolve(createResponse({ body: { conversation_flow_id: "conversation_flow_created" } }));
      }
      if (url.endsWith("/create-agent")) {
        return Promise.resolve(createResponse({ body: { agent_id: "agent_created" } }));
      }
      if (url.endsWith("/create-phone-number")) {
        return Promise.resolve(createResponse({ body: { phone_number: "+17135550124" } }));
      }
      return Promise.resolve(createResponse({ ok: false, status: 404, text: "not found" }));
    });

    const result = await provisionWorkspaceVoiceAgent({
      workspaceId,
      request: {
        accountScope: "member",
        ownerMemberId,
        serviceAreas: ["Houston"],
        transferNumber: null,
      },
      dependencies: {
        repository,
        environment,
        fetchImpl,
      },
    });

    expect(result.ok).toBe(true);
    expect(getWorkspaceVoiceAgent).toHaveBeenCalledWith(workspaceId, {
      accountScope: "member",
      ownerMemberId,
    });
    expect(markProvisioning).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId,
      ownership: {
        accountScope: "member",
        ownerMemberId,
      },
    }));
  });

  it("returns missing config before side effects when required Retell env is absent", async () => {
    const { repository, getWorkspace } = createRepository();
    const environmentWithoutProvisioningConfig: ServerEnvironment = {
      APP_ENV: environment.APP_ENV,
      NEXT_PUBLIC_APP_URL: environment.NEXT_PUBLIC_APP_URL,
      META_APP_ID: environment.META_APP_ID,
      META_APP_SECRET: environment.META_APP_SECRET,
      META_WEBHOOK_VERIFY_TOKEN: environment.META_WEBHOOK_VERIFY_TOKEN,
      RETELL_API_KEY: environment.RETELL_API_KEY,
      OPENAI_REPLY_MODEL: environment.OPENAI_REPLY_MODEL,
      NEXT_PUBLIC_SUPABASE_URL: environment.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: environment.SUPABASE_SERVICE_ROLE_KEY,
    };
    const result = await provisionWorkspaceVoiceAgent({
      workspaceId,
      request: {},
      dependencies: {
        repository,
        environment: environmentWithoutProvisioningConfig,
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      body: { error: "missing_retell_config" },
    });
    expect(getWorkspace).not.toHaveBeenCalled();
  });

  it("returns not found when the workspace is missing", async () => {
    const { repository } = createRepository({ workspace: null });

    await expect(provisionWorkspaceVoiceAgent({
      workspaceId,
      request: {},
      dependencies: {
        repository,
        environment,
      },
    })).resolves.toEqual({
      ok: false,
      status: 404,
      body: { error: "workspace_not_found" },
    });
  });

  it("marks the voice agent errored when Retell provisioning fails", async () => {
    const { repository, markError } = createRepository();
    const fetchImpl = vi.fn(() => Promise.resolve(createResponse({
      ok: false,
      status: 500,
      text: "retell unavailable",
    })));

    const result = await provisionWorkspaceVoiceAgent({
      workspaceId,
      request: {},
      dependencies: {
        repository,
        environment,
        fetchImpl,
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 500,
      body: { error: "provisioning_failed" },
    });
    expect(markError).toHaveBeenCalledWith({
      workspaceId,
      ownership: {
        accountScope: "workspace",
        ownerMemberId: null,
      },
      errorCode: "retell_provisioning_failed",
      errorMessage: expect.stringContaining("Retell API") as string,
    });
  });
});
