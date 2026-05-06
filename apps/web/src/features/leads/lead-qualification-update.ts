import {
  parseBudgetRangeText,
  UpdateLeadQualificationRequestSchema,
  workspaceRoleHasCapability,
  type AuditLogEntry,
  type AuthWorkspaceMembership,
  type UpdateLeadQualificationRequest,
} from "@realty-ops/core";
import type {
  LeadQualificationEditableRow,
  LeadQualificationRepository,
  LeadUpdateRow,
} from "../../lib/supabase/leads";

export type LeadQualificationAuditWriter = {
  insertAuditLog(entry: AuditLogEntry): Promise<void>;
};

export type UpdateLeadQualificationResult =
  | { status: "updated"; leadId: string; changedFields: string[] }
  | { status: "forbidden" }
  | { status: "not_found" };

function canManageLeadQualification(
  viewer: Pick<AuthWorkspaceMembership, "memberId" | "role">,
  lead: Pick<LeadQualificationEditableRow, "assigned_agent_id">,
): boolean {
  if (workspaceRoleHasCapability(viewer.role, "leads.manage_all")) {
    return true;
  }

  return workspaceRoleHasCapability(viewer.role, "leads.manage_assigned")
    && lead.assigned_agent_id === viewer.memberId;
}

function buildQualificationUpdateRow(input: UpdateLeadQualificationRequest): LeadUpdateRow {
  const row: LeadUpdateRow = {
    updated_at: new Date().toISOString(),
  };

  if (input.leadType !== undefined) {
    row.lead_type = input.leadType;
  }
  if (input.intent !== undefined) {
    row.intent = input.intent;
  }
  if (input.timeline !== undefined) {
    row.timeline = input.timeline;
  }
  if (input.budget !== undefined) {
    const budgetRange = parseBudgetRangeText(input.budget);
    row.budget_min = budgetRange.min;
    row.budget_max = budgetRange.max;
  }
  if (input.targetArea !== undefined) {
    row.target_area = input.targetArea;
  }
  if (input.financingStatus !== undefined) {
    row.financing_status = input.financingStatus;
  }

  return row;
}

function changedFieldsFromInput(input: UpdateLeadQualificationRequest): string[] {
  return Object.keys(input).sort();
}

export async function updateLeadQualification(params: {
  workspaceId: string;
  leadId: string;
  viewer: Pick<AuthWorkspaceMembership, "memberId" | "role">;
  input: unknown;
  repository: LeadQualificationRepository;
  auditRepository: LeadQualificationAuditWriter;
}): Promise<UpdateLeadQualificationResult> {
  const parsedInput = UpdateLeadQualificationRequestSchema.parse(params.input);
  const lead = await params.repository.findLeadForQualificationUpdate({
    workspaceId: params.workspaceId,
    leadId: params.leadId,
  });

  if (lead === null) {
    return { status: "not_found" };
  }

  if (!canManageLeadQualification(params.viewer, lead)) {
    return { status: "forbidden" };
  }

  const changedFields = changedFieldsFromInput(parsedInput);
  const updatedLead = await params.repository.updateLeadQualification({
    workspaceId: params.workspaceId,
    leadId: params.leadId,
    row: buildQualificationUpdateRow(parsedInput),
  });

  await params.auditRepository.insertAuditLog({
    workspaceId: params.workspaceId,
    userId: null,
    actorType: "user",
    action: "lead.qualification_updated",
    resourceType: "lead",
    resourceId: params.leadId,
    metadata: {
      changedFields,
      source: "leads_page",
    },
  });

  return {
    status: "updated",
    leadId: updatedLead.id,
    changedFields,
  };
}
