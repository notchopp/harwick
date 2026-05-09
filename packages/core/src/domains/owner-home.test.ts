import { describe, expect, it } from "vitest";
import { OwnerHomeQueueResponseSchema } from "./owner-home.js";

describe("OwnerHomeQueueResponseSchema", () => {
  it("accepts owner queue items with routing and inbox links", () => {
    const parsed = OwnerHomeQueueResponseSchema.parse({
      workspaceId: "223e4567-e89b-12d3-a456-426614174000",
      items: [
        {
          id: "routing:lead-1",
          workspaceId: "223e4567-e89b-12d3-a456-426614174000",
          leadId: "323e4567-e89b-12d3-a456-426614174000",
          kind: "routing",
          priority: "urgent",
          title: "Unknown lead needs routing",
          summary: "Buyer, Houston Heights, $650k, 30 days",
          reason: "No available agent matched area, lead type, property type, budget, and capacity.",
          actionLabel: "review routing",
          href: "/leads?leadId=323e4567-e89b-12d3-a456-426614174000",
          createdAt: "2026-05-08T12:00:00.000Z",
          dueAt: null,
        },
        {
          id: "inbox:lead-2",
          workspaceId: "223e4567-e89b-12d3-a456-426614174000",
          leadId: "423e4567-e89b-12d3-a456-426614174000",
          kind: "inbox",
          priority: "high",
          title: "Sarah Kim is paused for owner review",
          summary: "Lead asked to tour a listing this weekend.",
          reason: "Automation is paused pending owner review.",
          actionLabel: "open inbox",
          href: "/conversations?leadId=423e4567-e89b-12d3-a456-426614174000",
          createdAt: "2026-05-08T12:05:00.000Z",
          dueAt: "2026-05-08T12:30:00.000Z",
        },
      ],
    });

    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]?.kind).toBe("routing");
    expect(parsed.items[1]?.kind).toBe("inbox");
  });

  it("rejects queue rows without an action href", () => {
    expect(() => OwnerHomeQueueResponseSchema.parse({
      workspaceId: "223e4567-e89b-12d3-a456-426614174000",
      items: [{
        id: "ops:1",
        workspaceId: "223e4567-e89b-12d3-a456-426614174000",
        leadId: null,
        kind: "operations",
        priority: "high",
        title: "Worker heartbeat is stale",
        summary: "No worker heartbeat recorded recently.",
        reason: "Background follow-through is at risk.",
        actionLabel: "open settings",
        href: "",
        createdAt: "2026-05-08T12:05:00.000Z",
        dueAt: null,
      }],
    })).toThrow();
  });
});
