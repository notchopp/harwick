import { describe, expect, it, vi } from "vitest";
import {
  createOrRefreshVerifyListingTask,
  type VerifyListingTaskRepository,
} from "./verify-listing-task";

describe("createOrRefreshVerifyListingTask", () => {
  it("creates a high-priority verify task for an existing lead", async () => {
    const findLead = vi.fn<VerifyListingTaskRepository["findLead"]>().mockResolvedValue({
      assignedMemberId: "member-1",
    });
    const findOpenVerifyListingTask = vi.fn<VerifyListingTaskRepository["findOpenVerifyListingTask"]>()
      .mockResolvedValue(null);
    const insertVerifyListingTask = vi.fn<VerifyListingTaskRepository["insertVerifyListingTask"]>()
      .mockResolvedValue(undefined);
    const updateVerifyListingTask = vi.fn<VerifyListingTaskRepository["updateVerifyListingTask"]>()
      .mockResolvedValue(undefined);
    const repository: VerifyListingTaskRepository = {
      findLead,
      findOpenVerifyListingTask,
      insertVerifyListingTask,
      updateVerifyListingTask,
    };

    await expect(createOrRefreshVerifyListingTask({
      workspaceId: "workspace-1",
      leadId: "lead-1",
      listingReference: "123 Main St",
      question: "Does it have a pool?",
      verifiedAt: null,
      repository,
    })).resolves.toBe("created");

    const insertedCall = insertVerifyListingTask.mock.calls[0]?.[0];
    if (insertedCall === undefined) {
      throw new Error("Expected verify listing task insert payload.");
    }
    expect(insertedCall.workspaceId).toBe("workspace-1");
    expect(insertedCall.leadId).toBe("lead-1");
    expect(insertedCall.assignedMemberId).toBe("member-1");
    expect(insertedCall.priority).toBe("high");
    expect(insertedCall.description).toContain("Question: Does it have a pool?");
  });

  it("refreshes an existing open verify task instead of duplicating it", async () => {
    const findLead = vi.fn<VerifyListingTaskRepository["findLead"]>().mockResolvedValue({
      assignedMemberId: null,
    });
    const findOpenVerifyListingTask = vi.fn<VerifyListingTaskRepository["findOpenVerifyListingTask"]>()
      .mockResolvedValue({
        id: "task-1",
      });
    const insertVerifyListingTask = vi.fn<VerifyListingTaskRepository["insertVerifyListingTask"]>()
      .mockResolvedValue(undefined);
    const updateVerifyListingTask = vi.fn<VerifyListingTaskRepository["updateVerifyListingTask"]>()
      .mockResolvedValue(undefined);
    const repository: VerifyListingTaskRepository = {
      findLead,
      findOpenVerifyListingTask,
      insertVerifyListingTask,
      updateVerifyListingTask,
    };

    await expect(createOrRefreshVerifyListingTask({
      workspaceId: "workspace-1",
      leadId: "lead-1",
      listingReference: "456 Oak Ave",
      question: null,
      verifiedAt: "2026-04-28T23:00:00.000Z",
      repository,
    })).resolves.toBe("refreshed");

    expect(insertVerifyListingTask).not.toHaveBeenCalled();
    const updatedCall = updateVerifyListingTask.mock.calls[0]?.[0];
    if (updatedCall === undefined) {
      throw new Error("Expected verify listing task update payload.");
    }
    expect(updatedCall.taskId).toBe("task-1");
    expect(updatedCall.description).toContain("Last known verification timestamp");
  });

  it("skips task creation when the lead cannot be found", async () => {
    const repository: VerifyListingTaskRepository = {
      findLead: vi.fn<VerifyListingTaskRepository["findLead"]>().mockResolvedValue(null),
      findOpenVerifyListingTask: vi.fn<VerifyListingTaskRepository["findOpenVerifyListingTask"]>()
        .mockResolvedValue(null),
      insertVerifyListingTask: vi.fn<VerifyListingTaskRepository["insertVerifyListingTask"]>()
        .mockResolvedValue(undefined),
      updateVerifyListingTask: vi.fn<VerifyListingTaskRepository["updateVerifyListingTask"]>()
        .mockResolvedValue(undefined),
    };

    await expect(createOrRefreshVerifyListingTask({
      workspaceId: "workspace-1",
      leadId: "lead-1",
      listingReference: "789 Pine Rd",
      question: null,
      verifiedAt: null,
      repository,
    })).resolves.toBe("skipped");
  });
});
