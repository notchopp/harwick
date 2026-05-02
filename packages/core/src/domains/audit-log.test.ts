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
