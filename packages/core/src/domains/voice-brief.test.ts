import { describe, expect, it } from "vitest";
import {
  VoiceDailyBriefResponseSchema,
  VoiceShowingBriefQuerySchema,
  VoiceShowingDebriefRequestSchema,
} from "./voice-brief.js";

describe("voice brief contracts", () => {
  it("validates a daily brief payload", () => {
    expect(VoiceDailyBriefResponseSchema.parse({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      generatedAt: "2026-05-09T10:00:00.000Z",
      spokenText: "Good morning. You have three active conversations in the last hour.",
      summary: {
        activeConversationsLastHour: 3,
        unassignedPriorityLeads: 1,
        nurtureLeads: 2,
        pendingVoiceHandoffs: 1,
        openShowingTasks: 2,
      },
      highlights: [{
        leadId: "22222222-2222-4222-8222-222222222222",
        title: "Sarah Chen is active now",
        detail: "Inbound reply 12 minutes ago and still unrouted.",
      }],
    }).summary.activeConversationsLastHour).toBe(3);
  });

  it("requires leadId for showing brief lookup", () => {
    expect(() => VoiceShowingBriefQuerySchema.parse({})).toThrowError();
  });

  it("defaults debrief outcome and priority", () => {
    expect(VoiceShowingDebriefRequestSchema.parse({
      leadId: "22222222-2222-4222-8222-222222222222",
      debrief: "Showing wrapped. Lead wants comps and lender intro.",
    })).toMatchObject({
      outcome: "unknown",
      followUpTaskPriority: "high",
    });
  });
});
