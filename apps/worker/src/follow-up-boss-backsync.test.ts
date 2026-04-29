import { describe, expect, it } from "vitest";
import {
  mapFollowUpBossStageToLeadStatus,
  normalizeFollowUpBossActivityResource,
  normalizeFollowUpBossPeopleResource,
  shouldRequalifyFromFollowUpBossBacksyncEvent,
} from "./follow-up-boss-backsync.js";

describe("mapFollowUpBossStageToLeadStatus", () => {
  it("maps hot stages into hot lead status", () => {
    expect(mapFollowUpBossStageToLeadStatus("Hot Lead")).toBe("hot");
  });

  it("leaves unknown stages unmapped", () => {
    expect(mapFollowUpBossStageToLeadStatus("Archive Later")).toBeNull();
  });
});

describe("normalizeFollowUpBossPeopleResource", () => {
  it("normalizes people collections from the Follow Up Boss people endpoint", () => {
    expect(normalizeFollowUpBossPeopleResource({
      people: [
        {
          id: 1234,
          firstName: "Maya",
          lastName: "Lead",
          stage: "Qualified",
          emails: [{ value: "maya@example.com" }],
          phones: [{ value: "+17135550123" }],
        },
      ],
    })).toEqual([
      {
        personId: "1234",
        fullName: "Maya Lead",
        email: "maya@example.com",
        phone: "+17135550123",
        stage: "Qualified",
        assignedUserId: null,
      },
    ]);
  });
});

describe("normalizeFollowUpBossActivityResource", () => {
  it("normalizes note resources into internal activity records", () => {
    expect(normalizeFollowUpBossActivityResource({
      eventType: "notesCreated",
      payload: {
        id: 222,
        personId: 1234,
        body: "Called and asked about the Cypress listing.",
        created: "2026-04-28T15:24:07+00:00",
      },
      fallbackOccurredAt: "2026-04-28T15:25:00+00:00",
    })).toEqual([
      {
        activityId: "222",
        personId: "1234",
        providerUserId: null,
        text: "Called and asked about the Cypress listing.",
        occurredAt: "2026-04-28T15:24:07+00:00",
      },
    ]);
  });
});

describe("shouldRequalifyFromFollowUpBossBacksyncEvent", () => {
  it("requalifies lead activity that can change engagement intent", () => {
    expect(shouldRequalifyFromFollowUpBossBacksyncEvent("textMessagesCreated")).toBe(true);
    expect(shouldRequalifyFromFollowUpBossBacksyncEvent("callsCreated")).toBe(true);
  });

  it("skips stage and admin-only backsync events", () => {
    expect(shouldRequalifyFromFollowUpBossBacksyncEvent("peopleUpdated")).toBe(false);
    expect(shouldRequalifyFromFollowUpBossBacksyncEvent("peopleStageUpdated")).toBe(false);
    expect(shouldRequalifyFromFollowUpBossBacksyncEvent("notesCreated")).toBe(false);
  });
});
