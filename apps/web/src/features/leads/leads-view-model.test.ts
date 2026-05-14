import { describe, expect, it } from "vitest";
import { buildLeadAgentSnapshots, buildLeadPipelineMetrics } from "./leads-view-model";

describe("leads view model", () => {
  it("builds pipeline counts in the expected stage order", () => {
    const metrics = buildLeadPipelineMetrics([
      { stage: "hot" },
      { stage: "qualified" },
      { stage: "qualified" },
      { stage: "callback" },
      { stage: "showing" },
    ]);

    expect(metrics.map((metric) => [metric.id, metric.count])).toEqual([
      ["hot", 1],
      ["qualified", 2],
      ["unrouted", 0],
      ["callback", 1],
      ["nurture", 0],
      ["showing", 1],
    ]);
  });

  it("ranks assigned agents by urgent and total load", () => {
    const snapshots = buildLeadAgentSnapshots([
      { assignedTo: "Sarah Chen", stage: "qualified" },
      { assignedTo: "Sarah Chen", stage: "hot" },
      { assignedTo: "Sarah Chen", stage: "callback" },
      { assignedTo: "Miles Hart", stage: "qualified" },
      { assignedTo: "Miles Hart", stage: "hot" },
      { assignedTo: "owner review", stage: "unrouted" },
    ]);

    expect(snapshots).toEqual([
      { name: "Sarah Chen", initials: "SC", totalCount: 3, hotCount: 2 },
      { name: "Miles Hart", initials: "MH", totalCount: 2, hotCount: 1 },
    ]);
  });
});
