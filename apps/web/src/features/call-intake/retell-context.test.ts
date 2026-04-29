import { describe, expect, it, vi } from "vitest";
import type { WorkspaceVoiceAgentContextRow } from "../../lib/supabase/voice-agents";
import { handleRetellCallContext } from "./retell-context";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";

const contextRow: WorkspaceVoiceAgentContextRow = {
  workspace: {
    id: workspaceId,
    name: "Houston Brokerage",
  },
  voiceAgent: {
    id: "123e4567-e89b-12d3-a456-426614174001",
    workspace_id: workspaceId,
    account_scope: "workspace",
    owner_member_id: null,
    provider: "retell",
    status: "active",
    retell_agent_id: "agent_123",
    retell_conversation_flow_id: "conversation_flow_123",
    retell_phone_number_id: null,
    phone_number: null,
    service_areas: ["Houston", "Cypress"],
    transfer_number: "+17135550100",
    template_version: "realty_voice_v1",
    published_config_hash: null,
    webhook_url: "https://app.example.com/api/retell/webhook",
    dynamic_variables_webhook_url: "https://app.example.com/api/retell/context",
    last_synced_at: "2026-04-28T00:00:00.000Z",
    last_error_code: null,
    last_error_message: null,
    created_at: "2026-04-28T00:00:00.000Z",
    updated_at: "2026-04-28T00:00:00.000Z",
  },
  callerLead: null,
};

describe("handleRetellCallContext", () => {
  it("returns compact workspace dynamic variables for a known Retell agent", async () => {
    const repository = {
      getWorkspaceVoiceAgentByRetellAgentId: vi.fn().mockResolvedValue(contextRow),
    };

    const response = await handleRetellCallContext({
      body: {
        call: {
          agent_id: "agent_123",
          from_number: "+14845551234",
          to_number: "+17135550199",
        },
      },
      repository,
    });

    expect(repository.getWorkspaceVoiceAgentByRetellAgentId).toHaveBeenCalledWith({
      retellAgentId: "agent_123",
      fromNumber: "+14845551234",
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      workspace_id: workspaceId,
      workspace_name: "Houston Brokerage",
      retell_agent_id: "agent_123",
      lead_id: "",
      service_areas: "Houston, Cypress",
      transfer_number: "+17135550100",
      from_number: "+14845551234",
      to_number: "+17135550199",
      realty_next_action_type: "collect_intent",
      realty_must_verify_listing_status: true,
    }));
    if (response.status !== 200) {
      throw new Error("Expected Retell context response to succeed.");
    }

    expect(JSON.parse(response.body.realty_voice_contract_json)).toEqual(expect.objectContaining({
      version: "realty_voice_v1",
    }));
    expect(response).toEqual(expect.objectContaining({
      status: 200,
    }));
  });

  it("rejects context requests without an agent id before lookup", async () => {
    const repository = {
      getWorkspaceVoiceAgentByRetellAgentId: vi.fn().mockRejectedValue(new Error("should not be called")),
    };

    await expect(handleRetellCallContext({
      body: {
        call: {
          from_number: "+14845551234",
        },
      },
      repository,
    })).resolves.toEqual({
      status: 400,
      body: { error: "malformed_payload" },
    });
  });

  it("returns not found for unknown Retell agents", async () => {
    const repository = {
      getWorkspaceVoiceAgentByRetellAgentId: vi.fn().mockResolvedValue(null),
    };

    await expect(handleRetellCallContext({
      body: {
        agent_id: "agent_missing",
      },
      repository,
    })).resolves.toEqual({
      status: 404,
      body: { error: "voice_agent_not_found" },
    });
  });

  it("uses known caller context and assigned transfer routing when provided", async () => {
    const repository = {
      getWorkspaceVoiceAgentByRetellAgentId: vi.fn().mockResolvedValue({
        ...contextRow,
        callerLead: {
          leadId: "123e4567-e89b-12d3-a456-426614174099",
          callerName: "Jordan Lee",
          leadType: "buyer",
          targetArea: "The Heights",
          timeline: "2-4 weeks",
          budget: "$450,000-$575,000",
          financingStatus: "preapproved",
          memorySummary: "Known caller on file. buyer lead. Status: qualified. Score: 78. Area: The Heights. Timeline: 2-4 weeks.",
          preferredTransferNumber: "+17135550999",
        },
      } satisfies WorkspaceVoiceAgentContextRow),
    };

    const response = await handleRetellCallContext({
      body: {
        call: {
          agent_id: "agent_123",
          from_number: "+14845551234",
          to_number: "+17135550199",
        },
      },
      repository,
    });

    expect(response.status).toBe(200);
    if (response.status !== 200) {
      throw new Error("Expected known caller context response to succeed.");
    }

      expect(response.body).toEqual(expect.objectContaining({
        lead_id: "123e4567-e89b-12d3-a456-426614174099",
        caller_name: "Jordan Lee",
        lead_type: "buyer",
        target_area: "The Heights",
      timeline: "2-4 weeks",
      budget: "$450,000-$575,000",
      financing_status: "preapproved",
      transfer_number: "+17135550999",
    }));
    expect(response.body.memory_summary).toContain("Known caller on file.");
  });
});
