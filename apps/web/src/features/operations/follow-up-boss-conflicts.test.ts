import { describe, expect, it, vi } from "vitest";
import {
  loadFollowUpBossConflictQueue,
  type FollowUpBossConflictRepository,
} from "./follow-up-boss-conflicts";

const workspaceId = "11111111-1111-4111-8111-111111111111";

describe("follow up boss conflicts", () => {
  it("returns workspace-scoped potential conflict items", async () => {
    const listPotentialConflicts = vi.fn<FollowUpBossConflictRepository["listPotentialConflicts"]>()
      .mockResolvedValue([{
        id: "fub_conflict:evt-1",
        workspaceId,
        leadId: "22222222-2222-4222-8222-222222222222",
        followUpBossContactId: "981",
        assignedAgentId: "33333333-3333-4333-8333-333333333333",
        eventType: "peopleUpdated",
        status: "queued",
        detail: "person updated",
        occurredAt: "2026-04-29T12:00:00.000Z",
      }]);
    const repository: FollowUpBossConflictRepository = {
      listPotentialConflicts,
    };

    const response = await loadFollowUpBossConflictQueue({ workspaceId, repository });

    expect(response.items).toHaveLength(1);
    expect(listPotentialConflicts).toHaveBeenCalledWith({
      workspaceId,
      limit: 50,
    });
  });
});
