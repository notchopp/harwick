import { describe, expect, it } from "vitest";
import {
  HarwickLoopCreateRequestSchema,
  HarwickLoopCreateSchema,
  HarwickLoopRunSchema,
} from "./harwick-loop.js";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const memberId = "00000000-0000-0000-0000-000000000002";

describe("Harwick loop contracts", () => {
  it("validates a scheduled recurring cognitive job", () => {
    const loop = HarwickLoopCreateSchema.parse({
      workspaceId,
      createdByMemberId: memberId,
      name: "Monday market pulse",
      instruction: "Every Monday, review workspace context and surface the highest-signal market update.",
      triggerType: "schedule",
      scheduleSpec: "every Monday 9am",
      eventType: null,
      status: "active",
      approvalMode: "approval_required",
      outputMode: "work_item",
      toolAllowlist: ["workspace_memory.search", "web.search"],
      nextRunAt: "2026-05-11T13:00:00.000Z",
      lastRunAt: null,
      lastRunStatus: null,
    });

    expect(loop.triggerType).toBe("schedule");
    expect(loop.approvalMode).toBe("approval_required");
    expect(loop.toolAllowlist).toContain("web.search");
  });

  it("rejects scheduled loops without a cadence", () => {
    expect(() => HarwickLoopCreateSchema.parse({
      workspaceId,
      createdByMemberId: memberId,
      name: "Missing cadence",
      instruction: "Review the work queue.",
      triggerType: "schedule",
      scheduleSpec: null,
      eventType: null,
      status: "active",
      approvalMode: "suggest_only",
      outputMode: "work_item",
      toolAllowlist: [],
      nextRunAt: null,
      lastRunAt: null,
      lastRunStatus: null,
    })).toThrow();
  });

  it("defaults API create requests to safe reviewable output", () => {
    const request = HarwickLoopCreateRequestSchema.parse({
      name: "Friday queue review",
      instruction: "Review stale open work and summarize who needs attention.",
      scheduleSpec: "every Friday 4pm",
    });

    expect(request.triggerType).toBe("schedule");
    expect(request.approvalMode).toBe("approval_required");
    expect(request.outputMode).toBe("work_item");
  });

  it("validates loop run history records", () => {
    const run = HarwickLoopRunSchema.parse({
      id: "00000000-0000-0000-0000-000000000003",
      workspaceId,
      loopId: "00000000-0000-0000-0000-000000000004",
      status: "completed",
      startedAt: "2026-05-06T12:00:00.000Z",
      completedAt: "2026-05-06T12:00:05.000Z",
      instructionSnapshot: "Review the work queue.",
      resultSummary: "Created a reviewable Harwick work item.",
      errorMessage: null,
      workItemId: "00000000-0000-0000-0000-000000000005",
      metadata: { source: "agent_runtime_loops" },
    });

    expect(run.status).toBe("completed");
  });
});
