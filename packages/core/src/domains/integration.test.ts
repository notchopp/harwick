import { describe, expect, it } from "vitest";
import {
  CrmSyncLogSchema,
  FollowUpBossWebhookNotificationSchema,
  IntegrationProviderSchema,
} from "./integration.js";

describe("IntegrationProviderSchema", () => {
  it("accepts Repliers as a workspace-scoped listing integration", () => {
    expect(IntegrationProviderSchema.parse("repliers")).toBe("repliers");
  });
});

describe("FollowUpBossWebhookNotificationSchema", () => {
  it("parses supported Follow Up Boss webhook notifications", () => {
    expect(FollowUpBossWebhookNotificationSchema.parse({
      eventId: "64d0ad74-3aab-4b30-89c9-7337398cf8b4",
      eventCreated: "2026-04-28T15:24:07+00:00",
      event: "peopleStageUpdated",
      resourceIds: [1234],
      uri: "https://api.followupboss.com/v1/people?id=1234",
      data: {
        stage: "Hot",
      },
    })).toMatchObject({
      event: "peopleStageUpdated",
      resourceIds: [1234],
    });
  });
});

describe("CrmSyncLogSchema", () => {
  it("accepts outbound correlation metadata", () => {
    expect(CrmSyncLogSchema.parse({
      id: "123e4567-e89b-12d3-a456-426614174000",
      workspaceId: "123e4567-e89b-12d3-a456-426614174001",
      leadId: "123e4567-e89b-12d3-a456-426614174002",
      provider: "follow_up_boss",
      status: "synced",
      providerContactId: "1234",
      attemptCount: 1,
      lastErrorCode: null,
      lastErrorMessage: null,
      nextRetryAt: null,
      lastOutboundAt: "2026-04-28T15:24:07+00:00",
      backsyncSuppressedUntil: "2026-04-28T15:26:07+00:00",
      createdAt: "2026-04-28T15:24:07+00:00",
      updatedAt: "2026-04-28T15:24:07+00:00",
    }).backsyncSuppressedUntil).toBe("2026-04-28T15:26:07+00:00");
  });
});
