import { describe, expect, it, vi } from "vitest";
import type { NormalizedLeadEvent } from "@realty-ops/core";
import {
  persistRetellPostCallAnalysisHandoff,
  type VoiceLeadHandoffInsertRow,
  type VoiceLeadHandoffRepository,
} from "./voice-handoffs";
import type { EnqueueWorkflowJobInput } from "@realty-ops/core";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const leadId = "223e4567-e89b-12d3-a456-426614174000";

function retellEvent(overrides: Partial<NormalizedLeadEvent> = {}): NormalizedLeadEvent {
  return {
    workspaceId,
    provider: "retell",
    eventType: "call_completed",
    sourceChannel: "call",
    providerEventId: "call_123:call_analyzed",
    providerAccountId: "agent_123",
    providerUserId: "+17135550123",
    sourcePostId: null,
    sourceCommentId: null,
    instagramUsername: null,
    phone: "+17135550123",
    text: "Caller wants a tour this weekend.",
    occurredAt: "2026-05-24T12:00:00.000Z",
    rawPayload: {
      call: {
        call_id: "call_123",
        call_analysis: {
          callSummary: "Caller wants a tour this weekend.",
        },
      },
      extractedLead: {
        callSummary: "Caller wants a tour this weekend.",
        leadSummary: "Buyer is preapproved and wants Katy.",
        leadType: "buyer",
        intent: "high",
        targetArea: "Katy",
        timeline: "this weekend",
        budget: "$600k",
        financingStatus: "preapproved",
        callOutcome: "showing_requested",
        callerName: "Omar Banks",
      },
    },
    ...overrides,
  };
}

function createRepository(params: {
  existingHandoffId?: string | null;
  insertedHandoffs?: VoiceLeadHandoffInsertRow[];
} = {}): VoiceLeadHandoffRepository {
  return {
    findExistingLead() {
      return Promise.resolve(null);
    },
    insertLead() {
      return Promise.resolve({ id: leadId });
    },
    updateLead() {
      return Promise.resolve({ id: leadId });
    },
    findVoiceLeadHandoffByCallId: vi.fn().mockResolvedValue(
      params.existingHandoffId === undefined || params.existingHandoffId === null
        ? null
        : { id: params.existingHandoffId },
    ),
    insertVoiceLeadHandoff(row) {
      params.insertedHandoffs?.push(row);
      return Promise.resolve({ id: "323e4567-e89b-12d3-a456-426614174000" });
    },
  };
}

describe("persistRetellPostCallAnalysisHandoff", () => {
  it("creates a transcript-safe voice handoff from sanitized post-call analysis", async () => {
    const insertedHandoffs: VoiceLeadHandoffInsertRow[] = [];
    const enqueuedJobs: EnqueueWorkflowJobInput[] = [];
    const result = await persistRetellPostCallAnalysisHandoff({
      event: retellEvent(),
      leadId,
      repository: createRepository({ insertedHandoffs }),
      enqueueWorkflowJob(input) {
        enqueuedJobs.push(input);
        return Promise.resolve();
      },
    });

    expect(result).toEqual({
      leadId,
      handoffId: "323e4567-e89b-12d3-a456-426614174000",
      createdLead: false,
    });
    expect(insertedHandoffs).toHaveLength(1);
    expect(insertedHandoffs[0]).toMatchObject({
      workspace_id: workspaceId,
      lead_id: leadId,
      call_id: "call_123",
      retell_agent_id: "agent_123",
      phone: "+17135550123",
      caller_name: "Omar Banks",
      lead_type: "buyer",
      target_area: "Katy",
      timeline: "this weekend",
      budget: "$600k",
      financing_status: "preapproved",
      urgency: "hot",
      summary: "Caller wants a tour this weekend.",
      status: "captured",
    });
    expect(JSON.stringify(insertedHandoffs[0])).not.toContain("transcript");
    expect(enqueuedJobs).toEqual([
      expect.objectContaining({
        workspaceId,
        leadId,
        jobType: "lead_qualification",
        idempotencyKey: "voice_post_call_qualification:323e4567-e89b-12d3-a456-426614174000",
        payload: expect.objectContaining({
          reason: "post_call_analysis",
        }) as Record<string, unknown>,
      }),
    ]);
  });

  it("does not duplicate handoffs when the call already has one", async () => {
    const insertedHandoffs: VoiceLeadHandoffInsertRow[] = [];
    const result = await persistRetellPostCallAnalysisHandoff({
      event: retellEvent(),
      leadId,
      repository: createRepository({
        existingHandoffId: "423e4567-e89b-12d3-a456-426614174000",
        insertedHandoffs,
      }),
    });

    expect(result).toEqual({
      leadId,
      handoffId: "423e4567-e89b-12d3-a456-426614174000",
      createdLead: false,
    });
    expect(insertedHandoffs).toHaveLength(0);
  });

  it("skips Retell events that do not include a sanitized summary", async () => {
    const insertedHandoffs: VoiceLeadHandoffInsertRow[] = [];
    const result = await persistRetellPostCallAnalysisHandoff({
      event: retellEvent({
        rawPayload: {
          call: { call_id: "call_123" },
          extractedLead: {
            callSummary: null,
            leadSummary: null,
            leadType: "unknown",
            intent: "unknown",
            targetArea: null,
            timeline: null,
            budget: null,
            financingStatus: "unknown",
            callOutcome: null,
            callerName: null,
          },
        },
      }),
      leadId,
      repository: createRepository({ insertedHandoffs }),
    });

    expect(result).toBeNull();
    expect(insertedHandoffs).toHaveLength(0);
  });
});
