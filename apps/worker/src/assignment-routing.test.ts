import { describe, expect, it } from "vitest";
import { chooseAssignmentCandidate, type AssignmentRoutingCandidate } from "./assignment-routing.js";

const candidates: AssignmentRoutingCandidate[] = [
  {
    memberId: "123e4567-e89b-12d3-a456-426614174010",
    role: "agent",
    activeLeadCount: 3,
    openTaskCount: 2,
    urgentTaskCount: 1,
    createdAt: "2026-04-28T12:00:00.000Z",
  },
  {
    memberId: "123e4567-e89b-12d3-a456-426614174011",
    role: "agent",
    activeLeadCount: 1,
    openTaskCount: 1,
    urgentTaskCount: 0,
    createdAt: "2026-04-28T12:05:00.000Z",
  },
  {
    memberId: "123e4567-e89b-12d3-a456-426614174012",
    role: "lead_manager",
    activeLeadCount: 1,
    openTaskCount: 1,
    urgentTaskCount: 0,
    createdAt: "2026-04-28T11:55:00.000Z",
  },
];

describe("chooseAssignmentCandidate", () => {
  it("prefers the member who owns the source channel when available", () => {
    expect(chooseAssignmentCandidate({
      sourceOwnerMemberId: "123e4567-e89b-12d3-a456-426614174010",
      candidates,
    })).toEqual({
      memberId: "123e4567-e89b-12d3-a456-426614174010",
      strategy: "source_owner",
    });
  });

  it("falls back to the least-loaded eligible teammate", () => {
    expect(chooseAssignmentCandidate({
      sourceOwnerMemberId: null,
      candidates,
    })).toEqual({
      memberId: "123e4567-e89b-12d3-a456-426614174011",
      strategy: "workload_balanced",
    });
  });

  it("prefers frontline agents over managers when workload is tied", () => {
    expect(chooseAssignmentCandidate({
      sourceOwnerMemberId: null,
      candidates: candidates.slice(1),
    })).toEqual({
      memberId: "123e4567-e89b-12d3-a456-426614174011",
      strategy: "workload_balanced",
    });
  });

  it("returns none when no eligible candidates exist", () => {
    expect(chooseAssignmentCandidate({
      sourceOwnerMemberId: null,
      candidates: [],
    })).toEqual({
      memberId: null,
      strategy: "none",
    });
  });
});
