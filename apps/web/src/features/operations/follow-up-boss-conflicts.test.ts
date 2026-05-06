import { describe, expect, it, vi } from "vitest";
import {
  actOnFollowUpBossConflict,
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
      ignoreConflict: vi.fn(),
      replayConflict: vi.fn(),
    };

    const response = await loadFollowUpBossConflictQueue({ workspaceId, repository });

    expect(response.items).toHaveLength(1);
    expect(listPotentialConflicts).toHaveBeenCalledWith({
      workspaceId,
      limit: 50,
    });
  });

  it("routes ignore actions to the conflict repository", async () => {
    const ignoreConflict = vi.fn<FollowUpBossConflictRepository["ignoreConflict"]>()
      .mockResolvedValue({
        id: "fub_conflict:evt-1",
        workspaceId,
        leadId: "22222222-2222-4222-8222-222222222222",
        followUpBossContactId: "981",
        assignedAgentId: "33333333-3333-4333-8333-333333333333",
        eventType: "peopleUpdated",
        status: "ignored",
        detail: "person updated",
        occurredAt: "2026-04-29T12:00:00.000Z",
      });
    const repository: FollowUpBossConflictRepository = {
      listPotentialConflicts: vi.fn(),
      ignoreConflict,
      replayConflict: vi.fn(),
    };

    const result = await actOnFollowUpBossConflict({
      workspaceId,
      backsyncEventId: "44444444-4444-4444-8444-444444444444",
      request: { action: "ignore", reason: "Agent already handled this in FUB." },
      repository,
    });

    expect(result?.status).toBe("ignored");
    expect(ignoreConflict).toHaveBeenCalledWith({
      workspaceId,
      backsyncEventId: "44444444-4444-4444-8444-444444444444",
      reason: "Agent already handled this in FUB.",
    });
  });

  it("routes replay actions to the conflict repository", async () => {
    const replayConflict = vi.fn<FollowUpBossConflictRepository["replayConflict"]>()
      .mockResolvedValue({
        id: "fub_conflict:evt-1",
        workspaceId,
        leadId: "22222222-2222-4222-8222-222222222222",
        followUpBossContactId: "981",
        assignedAgentId: "33333333-3333-4333-8333-333333333333",
        eventType: "peopleUpdated",
        status: "queued",
        detail: "person updated",
        occurredAt: "2026-04-29T12:00:00.000Z",
      });
    const repository: FollowUpBossConflictRepository = {
      listPotentialConflicts: vi.fn(),
      ignoreConflict: vi.fn(),
      replayConflict,
    };

    const result = await actOnFollowUpBossConflict({
      workspaceId,
      backsyncEventId: "44444444-4444-4444-8444-444444444444",
      request: { action: "replay" },
      repository,
    });

    expect(result?.status).toBe("queued");
    expect(replayConflict).toHaveBeenCalledWith({
      workspaceId,
      backsyncEventId: "44444444-4444-4444-8444-444444444444",
    });
  });
});
