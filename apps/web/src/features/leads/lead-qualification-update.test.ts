import { describe, expect, it, vi } from "vitest";
import { updateLeadQualification, type LeadQualificationAuditWriter } from "./lead-qualification-update";
import type { LeadQualificationRepository } from "../../lib/supabase/leads";

const baseLead = {
  id: "11111111-1111-4111-8111-111111111111",
  workspace_id: "22222222-2222-4222-8222-222222222222",
  assigned_agent_id: "33333333-3333-4333-8333-333333333333",
  lead_type: "buyer",
  intent: "medium",
  timeline: null,
  budget_min: null,
  budget_max: null,
  target_area: null,
  financing_status: "unknown",
} as const;

function createRepository() {
  const findLeadForQualificationUpdateMock = vi.fn<LeadQualificationRepository["findLeadForQualificationUpdate"]>(
    () => Promise.resolve(baseLead),
  );
  const updateLeadQualificationMock = vi.fn<LeadQualificationRepository["updateLeadQualification"]>(
    () => Promise.resolve({ id: baseLead.id }),
  );
  const repository: LeadQualificationRepository = {
    findLeadForQualificationUpdate: findLeadForQualificationUpdateMock,
    updateLeadQualification: updateLeadQualificationMock,
  };

  return {
    repository,
    findLeadForQualificationUpdateMock,
    updateLeadQualificationMock,
  };
}

function createAuditRepository() {
  const insertAuditLogMock = vi.fn<LeadQualificationAuditWriter["insertAuditLog"]>(
    () => Promise.resolve(undefined),
  );
  const auditRepository: LeadQualificationAuditWriter = {
    insertAuditLog: insertAuditLogMock,
  };

  return {
    auditRepository,
    insertAuditLogMock,
  };
}

describe("updateLeadQualification", () => {
  it("lets managers update qualification fields and audits changed field names", async () => {
    const { repository, updateLeadQualificationMock } = createRepository();
    const { auditRepository, insertAuditLogMock } = createAuditRepository();

    const result = await updateLeadQualification({
      workspaceId: baseLead.workspace_id,
      leadId: baseLead.id,
      viewer: {
        memberId: "44444444-4444-4444-8444-444444444444",
        role: "lead_manager",
      },
      input: {
        leadType: "buyer",
        intent: "high",
        budget: "$450k - $575k",
        targetArea: "Katy",
        financingStatus: "preapproved",
      },
      repository,
      auditRepository,
    });

    expect(result).toEqual({
      status: "updated",
      leadId: baseLead.id,
      changedFields: ["budget", "financingStatus", "intent", "leadType", "targetArea"],
    });
    const updateCall = updateLeadQualificationMock.mock.calls[0]?.[0];
    expect(updateCall).toBeDefined();
    expect(updateCall?.workspaceId).toBe(baseLead.workspace_id);
    expect(updateCall?.leadId).toBe(baseLead.id);
    expect(updateCall?.row).toMatchObject({
      lead_type: "buyer",
      intent: "high",
      budget_min: 450000,
      budget_max: 575000,
      target_area: "Katy",
      financing_status: "preapproved",
    });
    expect(insertAuditLogMock).toHaveBeenCalledWith(expect.objectContaining({
      action: "lead.qualification_updated",
      resourceId: baseLead.id,
      metadata: {
        changedFields: ["budget", "financingStatus", "intent", "leadType", "targetArea"],
        source: "leads_page",
      },
    }));
  });

  it("lets assigned agents update only their assigned leads", async () => {
    const { repository } = createRepository();
    const { auditRepository } = createAuditRepository();

    const result = await updateLeadQualification({
      workspaceId: baseLead.workspace_id,
      leadId: baseLead.id,
      viewer: {
        memberId: baseLead.assigned_agent_id,
        role: "agent",
      },
      input: { timeline: "60 days" },
      repository,
      auditRepository,
    });

    expect(result.status).toBe("updated");
  });

  it("blocks assigned-only agents from updating another agent lead", async () => {
    const { repository, updateLeadQualificationMock } = createRepository();
    const { auditRepository, insertAuditLogMock } = createAuditRepository();

    const result = await updateLeadQualification({
      workspaceId: baseLead.workspace_id,
      leadId: baseLead.id,
      viewer: {
        memberId: "55555555-5555-4555-8555-555555555555",
        role: "agent",
      },
      input: { timeline: "60 days" },
      repository,
      auditRepository,
    });

    expect(result).toEqual({ status: "forbidden" });
    expect(updateLeadQualificationMock).not.toHaveBeenCalled();
    expect(insertAuditLogMock).not.toHaveBeenCalled();
  });
});
