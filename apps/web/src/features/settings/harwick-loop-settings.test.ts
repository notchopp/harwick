import { describe, expect, it } from "vitest";
import {
  buildHarwickLoopCreateRequest,
  formatHarwickLoopDate,
  parseHarwickLoopToolAllowlist,
} from "./harwick-loop-settings";

describe("harwick loop settings helpers", () => {
  it("builds a safe scheduled loop request from form state", () => {
    const result = buildHarwickLoopCreateRequest({
      name: "Friday queue review",
      instruction: "Review stale work and summarize who needs attention.",
      scheduleSpec: "every Friday 4pm",
      approvalMode: "approval_required",
      outputMode: "agent_loop",
      toolAllowlistText: "dispatch_subagent, workspace_memory.search\ndispatch_subagent",
    });

    expect(result).toEqual({
      ok: true,
      request: {
        name: "Friday queue review",
        instruction: "Review stale work and summarize who needs attention.",
        triggerType: "schedule",
        scheduleSpec: "every Friday 4pm",
        eventType: null,
        status: "active",
        approvalMode: "approval_required",
        outputMode: "agent_loop",
        toolAllowlist: ["dispatch_subagent", "workspace_memory.search"],
        nextRunAt: null,
      },
    });
  });

  it("rejects missing cadence before hitting the API", () => {
    const result = buildHarwickLoopCreateRequest({
      name: "Friday queue review",
      instruction: "Review stale work and summarize who needs attention.",
      scheduleSpec: "",
      approvalMode: "approval_required",
      outputMode: "work_item",
      toolAllowlistText: "",
    });

    expect(result).toEqual({
      ok: false,
      error: "Loop needs a name, schedule, and instruction.",
    });
  });

  it("parses comma and newline allowlists without duplicates", () => {
    expect(parseHarwickLoopToolAllowlist("dispatch_subagent, web.search\nweb.search")).toEqual([
      "dispatch_subagent",
      "web.search",
    ]);
  });

  it("formats nullable runtime dates for dense settings rows", () => {
    expect(formatHarwickLoopDate(null)).toBe("not scheduled");
    expect(formatHarwickLoopDate("2026-05-08T20:00:00.000Z")).toContain("May 8");
  });
});
