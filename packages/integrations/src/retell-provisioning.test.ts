import { describe, expect, it, vi } from "vitest";
import {
  buildRealtyConversationFlowBody,
  buildRealtyConversationFlowNodes,
  buildRealtyRetellDefaultVariables,
  createRetellProvisioningClient,
  provisionRealtyRetellAgent,
  type RealtyRetellProvisioningConfig,
} from "./retell-provisioning.js";

const config: RealtyRetellProvisioningConfig = {
  workspaceId: "123e4567-e89b-12d3-a456-426614174000",
  workspaceName: "Houston Brokerage",
  timezone: "America/Chicago",
  serviceAreas: ["Houston", "Cypress"],
  transferNumber: "+17135550100",
  templateFlowId: "conversation_flow_template",
  voiceId: "voice_realty",
  voiceWebhookBaseUrl: "https://voice.example.com",
  dynamicVariablesBaseUrl: "https://app.example.com",
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

describe("buildRealtyRetellDefaultVariables", () => {
  it("builds compact workspace call-start variables", () => {
    expect(buildRealtyRetellDefaultVariables(config)).toMatchObject({
      workspace_id: config.workspaceId,
      workspace_name: "Houston Brokerage",
      service_areas: "Houston, Cypress",
      transfer_number: "+17135550100",
      lead_type: "unknown",
      financing_status: "unknown",
    });
  });
});

describe("buildRealtyConversationFlowBody", () => {
  it("removes Retell-owned template fields and injects realtor prompt data", () => {
    const body = buildRealtyConversationFlowBody({
      config,
      templateFlow: {
        conversation_flow_id: "template",
        version: 3,
        is_published: true,
        global_prompt: "Old prompt",
        nodes: [{ id: "start" }],
        tools: [{ name: "legacy_tool", type: "custom" }],
      },
    });

    expect(body).not.toHaveProperty("conversation_flow_id");
    expect(body).not.toHaveProperty("version");
    expect(body).not.toHaveProperty("is_published");
    expect(body["global_prompt"]).toEqual(expect.stringContaining("real estate"));
    expect(body["default_dynamic_variables"]).toMatchObject({
      workspace_name: "Houston Brokerage",
    });
    expect(body["tools"]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "create_lead_handoff",
        url: "https://voice.example.com/api/retell/tools",
      }),
      expect.objectContaining({
        name: "lookup_listing",
        url: "https://voice.example.com/api/retell/tools",
      }),
      expect.objectContaining({
        name: "transfer_call",
        url: "https://voice.example.com/api/retell/tools",
      }),
      expect.objectContaining({
        name: "legacy_tool",
      }),
    ]));
    expect(body["start_node_id"]).toBe("realty-start");
    expect(body["nodes"]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "realty-buyer-qualification",
        tool_ids: ["lookup_listing"],
      }),
      expect.objectContaining({
        id: "realty-handoff-action-create-lead-handoff",
        type: "function",
        tool_id: "create_lead_handoff",
      }),
    ]));
  });
});

describe("buildRealtyConversationFlowNodes", () => {
  it("builds the voice routing graph for core real estate call paths", () => {
    const flow = buildRealtyConversationFlowNodes();

    expect(flow.startNodeId).toBe("realty-start");
    expect(flow.nodes.map((node) => node["id"])).toEqual(expect.arrayContaining([
      "realty-start",
      "realty-buyer-qualification",
      "realty-seller-qualification",
      "realty-listing-question",
      "realty-handoff",
      "realty-closing",
      "realty-end",
    ]));
  });
});

describe("provisionRealtyRetellAgent", () => {
  it("clones the template flow, creates an agent, and returns created assets", async () => {
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
    const client = createRetellProvisioningClient({
      apiKey: "retell-api-key",
      fetchImpl,
    });

    await expect(provisionRealtyRetellAgent({ config, client })).resolves.toEqual({
      conversationFlowId: "conversation_flow_created",
      agentId: "agent_created",
      retellPhoneNumberId: "+17135550123",
      phoneNumber: "+17135550123",
      created: true,
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://api.retellai.com/create-agent", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"dynamic_variables_webhook_url\":\"https://app.example.com/api/retell/context\"") as string,
    }));
    expect(fetchImpl).toHaveBeenCalledWith("https://api.retellai.com/create-phone-number", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"inbound_agent_id\":\"agent_created\"") as string,
    }));
  });

  it("creates a Realty Ops flow without requiring a template flow", async () => {
    const configWithoutTemplate: RealtyRetellProvisioningConfig = {
      ...config,
    };
    delete configWithoutTemplate.templateFlowId;
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = readRequestUrl(input);
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
    const client = createRetellProvisioningClient({
      apiKey: "retell-api-key",
      fetchImpl,
    });

    await expect(provisionRealtyRetellAgent({ config: configWithoutTemplate, client })).resolves.toMatchObject({
      conversationFlowId: "conversation_flow_created",
      agentId: "agent_created",
      created: true,
    });

    expect(fetchImpl).not.toHaveBeenCalledWith(
      "https://api.retellai.com/get-conversation-flow/conversation_flow_template",
      expect.anything(),
    );
    expect(fetchImpl).toHaveBeenCalledWith("https://api.retellai.com/create-conversation-flow", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"global_prompt\"") as string,
    }));
  });

  it("updates existing flow and agent without creating duplicates", async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL) => {
      const url = readRequestUrl(input);
      if (url.endsWith("/get-conversation-flow/conversation_flow_existing")) {
        return Promise.resolve(createResponse({
          body: {
            conversation_flow_id: "conversation_flow_existing",
            version: 9,
            global_prompt: "Existing",
            nodes: [],
          },
        }));
      }
      if (url.includes("/update-conversation-flow/conversation_flow_existing?version=9")) {
        return Promise.resolve(createResponse({ body: { conversation_flow_id: "conversation_flow_existing" } }));
      }
      if (url.endsWith("/update-agent/agent_existing")) {
        return Promise.resolve(createResponse({ body: { agent_id: "agent_existing" } }));
      }
      if (url.endsWith("/update-phone-number/%2B17135550123")) {
        return Promise.resolve(createResponse({ body: { phone_number: "+17135550123" } }));
      }
      return Promise.resolve(createResponse({ ok: false, status: 404, text: "not found" }));
    });
    const client = createRetellProvisioningClient({
      apiKey: "retell-api-key",
      fetchImpl,
    });

    await expect(provisionRealtyRetellAgent({
      config,
      client,
      existingRetellAgentId: "agent_existing",
      existingRetellConversationFlowId: "conversation_flow_existing",
      existingPhoneNumber: "+17135550123",
    })).resolves.toEqual({
      conversationFlowId: "conversation_flow_existing",
      agentId: "agent_existing",
      retellPhoneNumberId: "+17135550123",
      phoneNumber: "+17135550123",
      created: false,
    });

    expect(fetchImpl).not.toHaveBeenCalledWith("https://api.retellai.com/create-agent", expect.anything());
  });
});
