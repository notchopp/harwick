import type { NormalizedLeadEvent } from "@realty-ops/core";
import { describe, expect, it } from "vitest";
import {
  buildLeadLookupFromEvent,
  mapInboundEventToLeadInsertRow,
  mapInboundEventToLeadUpdateRow,
  readExtractedLeadFields,
  upsertLeadFromInboundEvent,
  type LeadInsertRow,
  type LeadLookup,
  type LeadRow,
  type LeadUpdateRow,
  type LeadUpsertRepository,
} from "./leads";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";

const inboundEvent: NormalizedLeadEvent = {
  workspaceId,
  provider: "meta",
  eventType: "message_received",
  sourceChannel: "instagram_dm",
  providerEventId: "message-1",
  providerAccountId: "ig-business-1",
  providerUserId: "ig-user-1",
  sourcePostId: null,
  sourceCommentId: null,
  instagramUsername: "buyerdemo",
  phone: null,
  text: "I need a realtor",
  occurredAt: "2026-04-24T15:00:00.000Z",
  rawPayload: {},
};

const retellAnalyzedEvent: NormalizedLeadEvent = {
  workspaceId,
  provider: "retell",
  eventType: "call_completed",
  sourceChannel: "call",
  providerEventId: "call-1:call_analyzed",
  providerAccountId: "agent-1",
  providerUserId: "+17135550123",
  sourcePostId: null,
  sourceCommentId: null,
  instagramUsername: null,
  phone: "+17135550123",
  text: "Caller wants to list in Houston.",
  occurredAt: "2026-04-28T15:00:00.000Z",
  rawPayload: {
    extractedLead: {
      callSummary: "Caller wants to list in Houston.",
      leadSummary: "Seller needs a valuation this week.",
      leadType: "seller",
      intent: "high",
      targetArea: "Houston",
      timeline: "this week",
      budget: "$450k-$575k",
      financingStatus: "unknown",
      callOutcome: "handoff_requested",
      callerName: "Jordan Lee",
    },
  },
};

function createLeadRepository(params: {
  existingLeadId?: string;
  insertedRows?: LeadInsertRow[];
  updatedRows?: LeadUpdateRow[];
  lookups?: LeadLookup[];
}): LeadUpsertRepository {
  return {
    findExistingLead(lookup) {
      params.lookups?.push(lookup);
      return Promise.resolve(params.existingLeadId === undefined ? null : { id: params.existingLeadId });
    },
    insertLead(row) {
      params.insertedRows?.push(row);
      return Promise.resolve({ id: "new-lead-id" });
    },
    updateLead(leadId, row) {
      params.updatedRows?.push(row);
      return Promise.resolve({ id: leadId });
    },
  };
}

describe("lead mapping", () => {
  it("builds a social lead lookup from Meta user identity", () => {
    expect(buildLeadLookupFromEvent(inboundEvent)).toEqual({
      workspaceId,
      instagramUserId: "ig-user-1",
      sourceProviderId: "ig-user-1",
      phone: null,
      email: null,
    });
  });

  it("maps inbound events to safe lead insert defaults", () => {
    expect(mapInboundEventToLeadInsertRow(inboundEvent)).toMatchObject({
      workspace_id: workspaceId,
      status: "new",
      source_channel: "instagram_dm",
      instagram_user_id: "ig-user-1",
      instagram_username: "buyerdemo",
      lead_type: "unknown",
      intent: "unknown",
      financing_status: "unknown",
      score: 0,
      last_message_at: "2026-04-24T15:00:00.000Z",
    } satisfies Partial<LeadRow>);
  });

  it("reads sanitized post-call extracted lead fields", () => {
    expect(readExtractedLeadFields(retellAnalyzedEvent)).toMatchObject({
      leadType: "seller",
      intent: "high",
      targetArea: "Houston",
      timeline: "this week",
      budget: "$450k-$575k",
      callerName: "Jordan Lee",
    });
  });

  it("maps Retell post-call extracted fields into lead inserts", () => {
    expect(mapInboundEventToLeadInsertRow(retellAnalyzedEvent)).toMatchObject({
      workspace_id: workspaceId,
      status: "hot",
      source_channel: "call",
      source_provider_id: "+17135550123",
      full_name: "Jordan Lee",
      phone: "+17135550123",
      lead_type: "seller",
      intent: "high",
      timeline: "this week",
      budget_min: 450000,
      budget_max: 575000,
      target_area: "Houston",
      score: 80,
      last_message_at: "2026-04-28T15:00:00.000Z",
    } satisfies Partial<LeadRow>);
  });

  it("updates existing leads with useful Retell extracted fields without unknown overwrites", () => {
    expect(mapInboundEventToLeadUpdateRow(retellAnalyzedEvent)).toMatchObject({
      status: "hot",
      source_channel: "call",
      source_provider_id: "+17135550123",
      full_name: "Jordan Lee",
      phone: "+17135550123",
      lead_type: "seller",
      intent: "high",
      timeline: "this week",
      budget_min: 450000,
      budget_max: 575000,
      target_area: "Houston",
      score: 80,
      last_message_at: "2026-04-28T15:00:00.000Z",
    });
  });

  it("maps inbound events to lead update rows", () => {
    expect(mapInboundEventToLeadUpdateRow(inboundEvent)).toMatchObject({
      source_channel: "instagram_dm",
      instagram_user_id: "ig-user-1",
      last_message_at: "2026-04-24T15:00:00.000Z",
    });
  });
});

describe("upsertLeadFromInboundEvent", () => {
  it("creates a lead when no existing identity matches", async () => {
    const insertedRows: LeadInsertRow[] = [];
    const result = await upsertLeadFromInboundEvent({
      event: inboundEvent,
      repository: createLeadRepository({ insertedRows }),
    });

    expect(result).toEqual({
      leadId: "new-lead-id",
      created: true,
    });
    expect(insertedRows).toHaveLength(1);
  });

  it("updates a lead when an identity matches", async () => {
    const updatedRows: LeadUpdateRow[] = [];
    const result = await upsertLeadFromInboundEvent({
      event: inboundEvent,
      repository: createLeadRepository({
        existingLeadId: "existing-lead-id",
        updatedRows,
      }),
    });

    expect(result).toEqual({
      leadId: "existing-lead-id",
      created: false,
    });
    expect(updatedRows).toHaveLength(1);
  });
});
