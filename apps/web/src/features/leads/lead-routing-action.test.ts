import { describe, expect, it } from "vitest";
import { routeLeadWithHarwick, type LeadRoutingAuditWriter } from "./lead-routing-action";
import type {
  LeadRoutingActionLeadRow,
  LeadRoutingActionMemberRow,
  LeadRoutingActionRepository,
} from "../../lib/supabase/leads";
import type { MemberRoutingProfileRow } from "../../lib/supabase/database.types";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const leadId = "123e4567-e89b-12d3-a456-426614174001";
const ownerId = "123e4567-e89b-12d3-a456-426614174010";
const sarahId = "123e4567-e89b-12d3-a456-426614174011";

const baseLead: LeadRoutingActionLeadRow = {
  id: leadId,
  workspace_id: workspaceId,
  status: "hot",
  assigned_agent_id: null,
  lead_type: "buyer",
  intent: "high",
  timeline: "60 days",
  budget_min: 450_000,
  budget_max: 550_000,
  target_area: "Katy",
  financing_status: "preapproved",
  score: 82,
};

const members: LeadRoutingActionMemberRow[] = [
  {
    id: ownerId,
    display_name: "Ademola",
    role: "owner",
    is_active: true,
  },
  {
    id: sarahId,
    display_name: "Sarah K.",
    role: "agent",
    is_active: true,
  },
];

const sarahProfile: MemberRoutingProfileRow = {
  id: "123e4567-e89b-12d3-a456-426614174090",
  workspace_id: workspaceId,
  member_id: sarahId,
  role_label: "Katy buyer specialist",
  areas: ["Katy", "Cypress"],
  property_types: ["single_family", "new_construction"],
  lead_types: ["buyer"],
  budget_min: 300_000,
  budget_max: 800_000,
  active_lead_count: 0,
  max_active_leads: 8,
  accepts_new_leads: true,
  notification_preference: "app",
  created_at: "2026-05-06T00:00:00.000Z",
  updated_at: "2026-05-06T00:00:00.000Z",
} as unknown as MemberRoutingProfileRow;

function createRepository(params?: {
  lead?: LeadRoutingActionLeadRow | null;
  profiles?: MemberRoutingProfileRow[];
}): LeadRoutingActionRepository & {
  assignedMemberIds: string[];
  decisions: unknown[];
  calls: {
    findLeadForRoutingAction: number;
  };
} {
  const assignedMemberIds: string[] = [];
  const decisions: unknown[] = [];
  const calls = {
    findLeadForRoutingAction: 0,
  };

  return {
    assignedMemberIds,
    decisions,
    calls,
    findLeadForRoutingAction() {
      calls.findLeadForRoutingAction += 1;
      return Promise.resolve(params?.lead ?? baseLead);
    },
    listRoutingProfiles() {
      return Promise.resolve(params?.profiles ?? [sarahProfile]);
    },
    listActiveWorkspaceMembers() {
      return Promise.resolve(members);
    },
    listAssignedActiveLeadCounts() {
      return Promise.resolve({ [sarahId]: 2 });
    },
    listCalendarRoutingSignals() {
      return Promise.resolve({
        [sarahId]: {
          calendarStatus: "connected",
          showingMode: "request_approve",
        },
      });
    },
    findLeadSourceOwnerMemberId() {
      return Promise.resolve(ownerId);
    },
    updateLeadAssignment(input) {
      assignedMemberIds.push(input.assignedMemberId);
      return Promise.resolve({ id: input.leadId });
    },
    insertRoutingDecision(row) {
      decisions.push(row);
      return Promise.resolve({ id: "123e4567-e89b-12d3-a456-426614174099" });
    },
  };
}

function createAuditWriter(): LeadRoutingAuditWriter & { entries: unknown[] } {
  const entries: unknown[] = [];
  return {
    entries,
    insertAuditLog(entry) {
      entries.push(entry);
      return Promise.resolve();
    },
  };
}

describe("routeLeadWithHarwick", () => {
  it("routes a qualified lead, persists the decision, updates assignment, and audits it", async () => {
    const repository = createRepository();
    const auditRepository = createAuditWriter();

    const result = await routeLeadWithHarwick({
      workspaceId,
      leadId,
      viewer: {
        memberId: ownerId,
        role: "owner",
      },
      input: {},
      repository,
      auditRepository,
    });

    expect(result).toMatchObject({
      status: "routed",
      response: {
        status: "assigned",
        assignedMemberId: sarahId,
        assignedDisplayName: "Sarah K.",
        routingDecisionId: "123e4567-e89b-12d3-a456-426614174099",
      },
    });
    expect(repository.assignedMemberIds).toEqual([sarahId]);
    expect(repository.decisions).toHaveLength(1);
    const decision = repository.decisions[0] as {
      evidence: { sourceOwnerMemberId: string; reasons: string[] };
    };
    expect(decision.evidence.sourceOwnerMemberId).toBe(ownerId);
    expect(decision.evidence.reasons).toContain("calendar connected for request + approve showings");
    expect(auditRepository.entries).toMatchObject([{
      action: "lead.assigned",
      metadata: {
        assignedMemberId: sarahId,
        previousAssignedMemberId: null,
        source: "leads_page",
      },
    }]);
  });

  it("records an unrouted decision without mutating assignment", async () => {
    const repository = createRepository({ profiles: [] });
    const auditRepository = createAuditWriter();

    const result = await routeLeadWithHarwick({
      workspaceId,
      leadId,
      viewer: {
        memberId: ownerId,
        role: "team_lead",
      },
      input: { mode: "auto" },
      repository,
      auditRepository,
    });

    expect(result).toMatchObject({
      status: "no_assignment",
      response: {
        status: "unrouted",
        assignedMemberId: null,
      },
    });
    expect(repository.assignedMemberIds).toEqual([]);
    expect(repository.decisions).toHaveLength(1);
    expect(auditRepository.entries).toEqual([]);
  });

  it("blocks assigned-only agents from changing team routing", async () => {
    const repository = createRepository();
    const auditRepository = createAuditWriter();

    const result = await routeLeadWithHarwick({
      workspaceId,
      leadId,
      viewer: {
        memberId: sarahId,
        role: "agent",
      },
      input: {},
      repository,
      auditRepository,
    });

    expect(result).toEqual({ status: "forbidden" });
    expect(repository.calls.findLeadForRoutingAction).toBe(0);
    expect(auditRepository.entries).toEqual([]);
  });
});
