import { describe, expect, it } from "vitest";
import { HarwickHomeWorkItemsResponseSchema } from "./home-data.js";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const leadId = "00000000-0000-0000-0000-000000000002";
const workItemId = "00000000-0000-0000-0000-000000000003";
const memberId = "00000000-0000-0000-0000-000000000004";

describe("HarwickHomeWorkItemsResponseSchema", () => {
  it("accepts a role or member-targeted Harwick insight for the home feed", () => {
    expect(
      HarwickHomeWorkItemsResponseSchema.parse({
        workspaceId,
        items: [{
          id: workItemId,
          workspaceId,
          leadId,
          type: "insight",
          status: "pending",
          priority: "high",
          title: "Lead has gone quiet",
          summary: "Sarah has had no recorded message for 5 days.",
          recommendedAction: "Send follow-up or start nurture",
          reason: "Harwick found an active lead without a next follow-up.",
          targetMemberId: memberId,
          targetRole: null,
          createdAt: "2026-05-05T12:00:00.000Z",
          dueAt: null,
        }],
      }),
    ).toMatchObject({
      workspaceId,
      items: [{
        id: workItemId,
        type: "insight",
        targetMemberId: memberId,
      }],
    });
  });
});
