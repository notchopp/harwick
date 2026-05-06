import { describe, expect, it } from "vitest";
import { AuditLogEntrySchema } from "./audit-log.js";

describe("AuditLogEntrySchema", () => {
  it("validates a user action", () => {
    const result = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: "00000000-0000-0000-0000-000000000002",
      actorType: "user",
      action: "lead.assigned",
      resourceType: "lead",
      resourceId: "00000000-0000-0000-0000-000000000003",
      metadata: { assignedTo: "agent-123" },
      ipAddress: "192.0.2.1",
      userAgent: "Mozilla/5.0",
    });
    expect(result.success).toBe(true);
  });

  it("validates an AI action without user", () => {
    const result = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "ai",
      action: "reply.ai_approved",
      resourceType: "reply",
      resourceId: "00000000-0000-0000-0000-000000000003",
      metadata: { turnId: "turn-123", confidence: 0.95 },
    });
    expect(result.success).toBe(true);
  });

  it("validates an AI policy shadow entry", () => {
    const result = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "ai",
      action: "harwick_ai.policy_shadow",
      resourceType: "harwick_ai_turn",
      resourceId: "00000000-0000-0000-0000-000000000003",
      metadata: {
        agree: false,
        deterministicAutoExecute: true,
        modelSelfGateAutoExecute: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it("validates work queue audit entries", () => {
    const socialReplyResult = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "user",
      action: "queue.social_reply_action",
      resourceType: "reply",
      resourceId: "00000000-0000-0000-0000-000000000003",
      metadata: { queueAction: "send", resultingStatus: "sent" },
    });
    const voiceResult = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "user",
      action: "queue.voice_handoff_action",
      resourceType: "voice_handoff",
      resourceId: "00000000-0000-0000-0000-000000000004",
      metadata: { queueAction: "create_callback_task" },
    });
    const workItemResult = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "user",
      action: "harwick_work_item.action",
      resourceType: "harwick_work_item",
      resourceId: "00000000-0000-0000-0000-000000000005",
      metadata: { queueAction: "dismiss" },
    });
    const showingResult = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "user",
      action: "queue.showing_task_action",
      resourceType: "showing_task",
      resourceId: "00000000-0000-0000-0000-000000000006",
      metadata: { queueAction: "approve_and_book" },
    });
    const nurtureResult = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "user",
      action: "queue.nurture_message_action",
      resourceType: "nurture_message",
      resourceId: "00000000-0000-0000-0000-000000000007",
      metadata: { queueAction: "approve_send" },
    });
    const operationsResult = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "user",
      action: "operations.failure_action",
      resourceType: "workflow_job",
      resourceId: "00000000-0000-0000-0000-000000000008",
      metadata: { queueAction: "retry_now" },
    });
    const fubConflictResult = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "user",
      action: "operations.fub_conflict_action",
      resourceType: "crm_backsync_event",
      resourceId: "00000000-0000-0000-0000-000000000009",
      metadata: { queueAction: "replay" },
    });

    expect(socialReplyResult.success).toBe(true);
    expect(voiceResult.success).toBe(true);
    expect(workItemResult.success).toBe(true);
    expect(showingResult.success).toBe(true);
    expect(nurtureResult.success).toBe(true);
    expect(operationsResult.success).toBe(true);
    expect(fubConflictResult.success).toBe(true);
  });

  it("validates a system action", () => {
    const result = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "system",
      action: "integration.connected",
      resourceType: "integration",
      resourceId: "00000000-0000-0000-0000-000000000004",
      metadata: { provider: "meta" },
    });
    expect(result.success).toBe(true);
  });

  it("defaults metadata to empty object", () => {
    const result = AuditLogEntrySchema.parse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "system",
      action: "workspace.settings_changed",
      resourceType: "workspace",
      resourceId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result.metadata).toEqual({});
  });

  it("rejects invalid actor type", () => {
    const result = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "robot",
      action: "lead.assigned",
      resourceType: "lead",
      resourceId: null,
      metadata: {},
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid action", () => {
    const result = AuditLogEntrySchema.safeParse({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "user",
      action: "unknown.action",
      resourceType: "lead",
      resourceId: null,
      metadata: {},
    });
    expect(result.success).toBe(false);
  });
});
