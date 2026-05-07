import { describe, expect, it } from "vitest";
import {
  undoLeadRoutingDecision,
  type LeadRoutingUndoCandidate,
  type LeadRoutingUndoRepository,
} from "./lead-routing-undo";

const workspaceId = "00000000-0000-0000-0000-0000000000aa";
const leadId = "00000000-0000-0000-0000-0000000000bb";
const routingDecisionId = "00000000-0000-0000-0000-0000000000cc";
const reversalDecisionId = "00000000-0000-0000-0000-0000000000dd";
const approverMemberId = "00000000-0000-0000-0000-0000000000ee";
const previousMemberId = "00000000-0000-0000-0000-000000000010";
const newlyAssignedMemberId = "00000000-0000-0000-0000-000000000011";

function makeRepo(candidate: LeadRoutingUndoCandidate | null): {
  repo: LeadRoutingUndoRepository;
  calls: { setAssignment: unknown[]; reversal: unknown[] };
} {
  const calls = { setAssignment: [] as unknown[], reversal: [] as unknown[] };
  return {
    calls,
    repo: {
      findRoutingDecisionForUndo() {
        return Promise.resolve(candidate);
      },
      setLeadAssignment(params) {
        calls.setAssignment.push(params);
        return Promise.resolve();
      },
      insertReversalDecision(params) {
        calls.reversal.push(params);
        return Promise.resolve({ id: reversalDecisionId });
      },
    },
  };
}

function makeAuditRepo() {
  const inserted: unknown[] = [];
  return {
    inserted,
    repo: {
      insertAuditLog(entry: unknown) {
        inserted.push(entry);
        return Promise.resolve();
      },
    },
  };
}

const baseCandidate: LeadRoutingUndoCandidate = {
  workspaceId,
  leadId,
  finalMemberId: newlyAssignedMemberId,
  decidedAt: "2026-05-06T20:00:00.000Z",
  previousAssignedMemberId: previousMemberId,
  reason: "best match for area + capacity",
};

describe("undoLeadRoutingDecision", () => {
  it("forbids viewers without routing.manage capability", async () => {
    const { repo } = makeRepo(baseCandidate);
    const audit = makeAuditRepo();
    const result = await undoLeadRoutingDecision({
      workspaceId,
      leadId,
      routingDecisionId,
      viewer: { memberId: approverMemberId, role: "viewer" },
      repository: repo,
      auditRepository: audit.repo,
    });
    expect(result.status).toBe("forbidden");
    expect(audit.inserted).toHaveLength(0);
  });

  it("returns not_found when the routing decision is missing", async () => {
    const { repo } = makeRepo(null);
    const audit = makeAuditRepo();
    const result = await undoLeadRoutingDecision({
      workspaceId,
      leadId,
      routingDecisionId,
      viewer: { memberId: approverMemberId, role: "owner" },
      repository: repo,
      auditRepository: audit.repo,
    });
    expect(result.status).toBe("not_found");
  });

  it("rejects when the decision is for a different lead", async () => {
    const { repo } = makeRepo({ ...baseCandidate, leadId: "00000000-0000-0000-0000-0000000000ff" });
    const audit = makeAuditRepo();
    const result = await undoLeadRoutingDecision({
      workspaceId,
      leadId,
      routingDecisionId,
      viewer: { memberId: approverMemberId, role: "owner" },
      repository: repo,
      auditRepository: audit.repo,
    });
    expect(result.status).toBe("lead_mismatch");
  });

  it("rejects when the undo window has elapsed", async () => {
    const { repo, calls } = makeRepo(baseCandidate);
    const audit = makeAuditRepo();
    const result = await undoLeadRoutingDecision({
      workspaceId,
      leadId,
      routingDecisionId,
      viewer: { memberId: approverMemberId, role: "owner" },
      repository: repo,
      auditRepository: audit.repo,
      now: () => new Date("2026-05-06T20:11:00.000Z"),
    });
    expect(result.status).toBe("window_expired");
    expect(calls.setAssignment).toHaveLength(0);
    expect(calls.reversal).toHaveLength(0);
  });

  it("rejects when there is nothing to undo (no prior assignment change)", async () => {
    const { repo } = makeRepo({ ...baseCandidate, previousAssignedMemberId: newlyAssignedMemberId });
    const audit = makeAuditRepo();
    const result = await undoLeadRoutingDecision({
      workspaceId,
      leadId,
      routingDecisionId,
      viewer: { memberId: approverMemberId, role: "owner" },
      repository: repo,
      auditRepository: audit.repo,
      now: () => new Date("2026-05-06T20:05:00.000Z"),
    });
    expect(result.status).toBe("no_previous_assignment");
  });

  it("reverses the assignment, writes a reversal decision, and audits the undo within window", async () => {
    const { repo, calls } = makeRepo(baseCandidate);
    const audit = makeAuditRepo();
    const result = await undoLeadRoutingDecision({
      workspaceId,
      leadId,
      routingDecisionId,
      viewer: { memberId: approverMemberId, role: "owner" },
      repository: repo,
      auditRepository: audit.repo,
      now: () => new Date("2026-05-06T20:05:00.000Z"),
    });
    expect(result).toEqual({
      status: "undone",
      reversalDecisionId,
      restoredAssignedMemberId: previousMemberId,
    });
    expect(calls.setAssignment).toHaveLength(1);
    expect(calls.setAssignment[0]).toEqual({
      workspaceId,
      leadId,
      assignedMemberId: previousMemberId,
    });
    expect(calls.reversal).toHaveLength(1);
    expect(audit.inserted).toHaveLength(1);
    const auditEntry = audit.inserted[0] as { action: string; metadata: Record<string, unknown> };
    expect(auditEntry.action).toBe("lead.reassigned");
    expect(auditEntry.metadata["mode"]).toBe("undo");
    expect(auditEntry.metadata["originalDecisionId"]).toBe(routingDecisionId);
    expect(auditEntry.metadata["restoredAssignedMemberId"]).toBe(previousMemberId);
  });

  it("supports restoring to an unassigned state (previous null)", async () => {
    const { repo, calls } = makeRepo({ ...baseCandidate, previousAssignedMemberId: null });
    const audit = makeAuditRepo();
    const result = await undoLeadRoutingDecision({
      workspaceId,
      leadId,
      routingDecisionId,
      viewer: { memberId: approverMemberId, role: "admin" },
      repository: repo,
      auditRepository: audit.repo,
      now: () => new Date("2026-05-06T20:05:00.000Z"),
    });
    expect(result.status).toBe("undone");
    expect(calls.setAssignment[0]).toEqual({
      workspaceId,
      leadId,
      assignedMemberId: null,
    });
  });
});
