import { describe, expect, it } from "vitest";
import { buildRealtyVoiceAliases, buildRealtyVoiceContract } from "./voice-contract.js";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";

describe("buildRealtyVoiceContract", () => {
  it("builds a new-caller real estate qualification contract", () => {
    const contract = buildRealtyVoiceContract({
      workspaceId,
      workspaceName: "Houston Brokerage",
      serviceAreas: ["Houston", "Cypress"],
      transferNumber: "+17135550100",
      retellAgentId: "agent_123",
      fromNumber: "+14845551234",
      toNumber: "+17135550199",
    });

    expect(contract.version).toBe("realty_voice_v1");
    expect(contract.caller.known).toBe(false);
    expect(contract.caller.nameCollectionRequired).toBe(true);
    expect(contract.caller.relationshipTier).toBe("new");
    expect(contract.actionContract.nextAction.type).toBe("collect_intent");
    expect(contract.actionContract.nextAction.preferredTools).toEqual([
      "create_lead_handoff",
      "lookup_listing",
      "transfer_call",
    ]);
    expect(contract.actionContract.followThroughPolicy.style).toBe("qualify_then_route");
    expect(contract.actionContract.followThroughPolicy.fallbackAction).toBe("transfer_to_human");
    expect(contract.constraints.mustNotClaimListingAvailabilityWithoutSource).toBe(true);
    expect(contract.constraints.mustEscalateLegalLendingAdvice).toBe(true);
    expect(contract.constraints.canTransferToHuman).toBe(true);
  });

  it("exports flat Retell aliases with the full contract serialized", () => {
    const contract = buildRealtyVoiceContract({
      workspaceId,
      workspaceName: "Houston Brokerage",
      serviceAreas: [],
      transferNumber: null,
      retellAgentId: "agent_123",
      callerName: "Maya",
      memorySummary: "Maya asked about new construction in Cypress.",
    });
    const aliases = buildRealtyVoiceAliases(contract);

    expect(aliases).toEqual(expect.objectContaining({
      realty_opening_text: "Hey Maya, thanks for calling Houston Brokerage. Are you calling about a home, selling, or something else today?",
      realty_memory_summary: "Maya asked about new construction in Cypress.",
      realty_can_transfer_to_human: false,
      realty_must_verify_listing_status: true,
    }));
    expect(JSON.parse(aliases.realty_voice_contract_json)).toEqual(expect.objectContaining({
      version: "realty_voice_v1",
    }));
  });
});
