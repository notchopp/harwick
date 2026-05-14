import { describe, expect, it } from "vitest";
import {
  generatePolicyNarrative,
  WorkspacePolicyNarrativeUpdateRequestSchema,
} from "./policy-narrative.js";

const workspaceId = "00000000-0000-0000-0000-000000000001";

describe("policy narrative", () => {
  it("generates plain-English policy from structured automation settings", () => {
    const narrative = generatePolicyNarrative({
      id: "00000000-0000-0000-0000-000000000002",
      workspaceId,
      memberId: null,
      leadId: null,
      scope: "workspace",
      automationMode: "ai_on",
      autoSendEnabled: true,
      confidenceThreshold: 0.82,
      allowedAutoActions: ["send_reply", "ask_qualification"],
      requiresApprovalActions: ["route_lead"],
      allowedAutoTools: ["send_meta_message"],
      requiresApprovalTools: ["sync_follow_up_boss"],
      blockedSafetyFlags: ["legal_advice"],
      createdAt: "2026-05-05T12:00:00.000Z",
      updatedAt: "2026-05-05T12:00:00.000Z",
    });

    expect(narrative.workspaceId).toBe(workspaceId);
    expect(narrative.body).toContain("Automation is on.");
    expect(narrative.body).toContain("send conversational replies");
    expect(narrative.body).toContain("sync_follow_up_boss");
    expect(narrative.body).toContain("legal advice");
  });

  it("validates manual standing instructions before persistence", () => {
    const parsed = WorkspacePolicyNarrativeUpdateRequestSchema.parse({
      body: "Every closed lead gets a thank-you and a 6-month check-in.",
    });

    expect(parsed.body).toBe("Every closed lead gets a thank-you and a 6-month check-in.");
    expect(() => WorkspacePolicyNarrativeUpdateRequestSchema.parse({ body: "" })).toThrow();
  });
});
