import type { NormalizedLeadEvent } from "@realty-ops/core";
import { describe, expect, it } from "vitest";
import {
  createLeadEventWriter,
  createMetaWorkspaceResolver,
  createRetellWorkspaceResolver,
  mapNormalizedLeadEventToInsertRow,
  toLeadEventIdentityKey,
  type IntegrationAccountLookup,
  type LeadEventIdentity,
  type LeadEventInsertRow,
  type LeadEventPersistenceRepository,
} from "./lead-events";
import type { LeadLookup, LeadUpsertRepository } from "./leads";
import type { WorkflowJobEnqueuer } from "./workflow-jobs";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";

const normalizedEvent: NormalizedLeadEvent = {
  workspaceId,
  provider: "meta",
  eventType: "comment_received",
  sourceChannel: "instagram_comment",
  providerEventId: "comment-1",
  providerAccountId: "ig-business-1",
  providerUserId: "ig-user-1",
  sourcePostId: "media-1",
  sourceCommentId: "comment-1",
  instagramUsername: "buyerdemo",
  phone: null,
  text: "Price?",
  occurredAt: "2026-04-24T15:00:00.000Z",
  rawPayload: {
    field: "comments",
  },
};

function createRepository(params: {
  workspaceByProviderAccountId?: Map<string, string>;
  existingIdentities?: Set<string>;
  insertedRows?: LeadEventInsertRow[];
  optedOutLeadIds?: string[];
}): LeadEventPersistenceRepository {
  return {
    findWorkspaceIdByIntegrationAccount(lookup: IntegrationAccountLookup) {
      if (lookup.provider !== "meta") {
        return Promise.resolve(null);
      }

      return Promise.resolve(params.workspaceByProviderAccountId?.get(lookup.providerAccountId) ?? null);
    },
    findExistingLeadEventIdentities(identities: LeadEventIdentity[]) {
      const existingIdentities = params.existingIdentities ?? new Set<string>();
      const matchingIdentities = identities
        .map(toLeadEventIdentityKey)
        .filter((identityKey) => existingIdentities.has(identityKey));

      return Promise.resolve(new Set(matchingIdentities));
    },
    insertLeadEventRows(rows: LeadEventInsertRow[]) {
      params.insertedRows?.push(...rows);
      return Promise.resolve(rows.length);
    },
    markLeadNurtureOptedOut(input) {
      params.optedOutLeadIds?.push(input.leadId);
      return Promise.resolve();
    },
    getLeadEventById() {
      return Promise.resolve(null);
    },
  };
}

function createLeadUpsertRepository(params: {
  upsertedLookups: LeadLookup[];
}): LeadUpsertRepository {
  return {
    findExistingLead(lookup) {
      params.upsertedLookups.push(lookup);
      return Promise.resolve(null);
    },
    insertLead() {
      return Promise.resolve({ id: "lead-id" });
    },
    updateLead() {
      return Promise.resolve({ id: "lead-id" });
    },
  };
}

describe("mapNormalizedLeadEventToInsertRow", () => {
  it("maps normalized events to lead_events insert rows", () => {
    expect(mapNormalizedLeadEventToInsertRow(normalizedEvent)).toEqual({
      workspace_id: workspaceId,
      lead_id: null,
      provider: "meta",
      event_type: "comment_received",
      source_channel: "instagram_comment",
      provider_event_id: "comment-1",
      provider_account_id: "ig-business-1",
      provider_user_id: "ig-user-1",
      source_post_id: "media-1",
      source_comment_id: "comment-1",
      text: "Price?",
      occurred_at: "2026-04-24T15:00:00.000Z",
    });
  });
});

describe("createMetaWorkspaceResolver", () => {
  it("resolves a workspace from a connected Meta account", async () => {
    const resolver = createMetaWorkspaceResolver(createRepository({
      workspaceByProviderAccountId: new Map([["ig-business-1", workspaceId]]),
    }));

    await expect(resolver("ig-business-1")).resolves.toBe(workspaceId);
  });
});

describe("createRetellWorkspaceResolver", () => {
  it("prefers workspace-owned voice agents over integration seed rows", async () => {
    const resolver = createRetellWorkspaceResolver({
      ...createRepository({
        workspaceByProviderAccountId: new Map([["agent-1", "integration-workspace"]]),
      }),
      findWorkspaceIdByVoiceAgent() {
        return Promise.resolve(workspaceId);
      },
    });

    await expect(resolver("agent-1")).resolves.toBe(workspaceId);
  });
});

describe("createLeadEventWriter", () => {
  it("inserts new lead events", async () => {
    const insertedRows: LeadEventInsertRow[] = [];
    const writer = createLeadEventWriter(createRepository({ insertedRows }));

    await expect(writer([normalizedEvent])).resolves.toEqual({
      persistedCount: 1,
      duplicateCount: 0,
      leadUpsertCount: 0,
    });
    expect(insertedRows).toHaveLength(1);
  });

  it("skips duplicate lead events", async () => {
    const insertedRows: LeadEventInsertRow[] = [];
    const writer = createLeadEventWriter(createRepository({
      insertedRows,
      existingIdentities: new Set([toLeadEventIdentityKey({
        workspaceId,
        provider: "meta",
        providerEventId: "comment-1",
      })]),
    }));

    await expect(writer([normalizedEvent])).resolves.toEqual({
      persistedCount: 0,
      duplicateCount: 1,
      leadUpsertCount: 0,
    });
    expect(insertedRows).toHaveLength(0);
  });

  it("upserts leads for newly persisted events", async () => {
    const insertedRows: LeadEventInsertRow[] = [];
    const upsertedLookups: LeadLookup[] = [];
    const writer = createLeadEventWriter(
      createRepository({ insertedRows }),
      {
        leadUpsertRepository: createLeadUpsertRepository({ upsertedLookups }),
      },
    );

    await expect(writer([normalizedEvent])).resolves.toEqual({
      persistedCount: 1,
      duplicateCount: 0,
      leadUpsertCount: 1,
    });
    expect(upsertedLookups).toEqual([
      {
        workspaceId,
        instagramUserId: "ig-user-1",
        sourceProviderId: "ig-user-1",
        phone: null,
        email: null,
      },
    ]);
    expect(insertedRows[0]?.lead_id).toBe("lead-id");
  });

  it("enqueues intake and qualification work for new events", async () => {
    const insertedRows: LeadEventInsertRow[] = [];
    const enqueued: Parameters<WorkflowJobEnqueuer>[0][] = [];
    const writer = createLeadEventWriter(
      createRepository({ insertedRows }),
      {
        leadUpsertRepository: createLeadUpsertRepository({ upsertedLookups: [] }),
        enqueueWorkflowJob(input) {
          enqueued.push(input);
          return Promise.resolve();
        },
      },
    );

    await expect(writer([normalizedEvent])).resolves.toMatchObject({
      persistedCount: 1,
      leadUpsertCount: 1,
    });
    expect(enqueued).toEqual([
      expect.objectContaining({
        jobType: "lead_intake",
        leadId: "lead-id",
        idempotencyKey: "lead_intake:meta:comment-1",
      }),
      expect.objectContaining({
        jobType: "lead_qualification",
        leadId: "lead-id",
        idempotencyKey: "lead_qualification:meta:comment-1",
      }),
    ]);
  });

  it("marks active nurture opted out when an inbound event says stop", async () => {
    const optedOutLeadIds: string[] = [];
    const writer = createLeadEventWriter(
      createRepository({ optedOutLeadIds }),
      {
        leadUpsertRepository: createLeadUpsertRepository({ upsertedLookups: [] }),
      },
    );

    await writer([{
      ...normalizedEvent,
      providerEventId: "message-stop-1",
      eventType: "message_received",
      sourceChannel: "instagram_dm",
      text: "STOP",
    }]);

    expect(optedOutLeadIds).toEqual(["lead-id"]);
  });
});
