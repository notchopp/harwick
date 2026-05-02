import { describe, expect, it, vi } from "vitest";
import type { AuditLogEntry } from "@realty-ops/core";
import { createSupabaseAuditLogRepository } from "./audit-logs";
import type { RealtyOpsSupabaseClient } from "./server-client";

function createMockSupabase(error: Error | null = null) {
  const insert = vi.fn(() => ({ error }));
  const from = vi.fn(() => ({
    insert,
  }));
  return {
    client: {
      from,
    } as unknown as RealtyOpsSupabaseClient,
    from,
    insert,
  };
}

describe("createSupabaseAuditLogRepository", () => {
  it("inserts audit log for user action", async () => {
    const supabase = createMockSupabase();
    const repository = createSupabaseAuditLogRepository(supabase.client);

    const entry: AuditLogEntry = {
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: "00000000-0000-0000-0000-000000000002",
      actorType: "user",
      action: "lead.assigned",
      resourceType: "lead",
      resourceId: "00000000-0000-0000-0000-000000000003",
      metadata: { assignedTo: "agent-123" },
      ipAddress: "192.0.2.1",
      userAgent: "Mozilla/5.0",
    };

    await repository.insertAuditLog(entry);

    expect(supabase.from).toHaveBeenCalledWith("audit_logs");
    expect(supabase.insert).toHaveBeenCalledWith({
      workspace_id: "00000000-0000-0000-0000-000000000001",
      user_id: "00000000-0000-0000-0000-000000000002",
      actor_type: "user",
      action: "lead.assigned",
      resource_type: "lead",
      resource_id: "00000000-0000-0000-0000-000000000003",
      metadata: { assignedTo: "agent-123" },
      ip_address: "192.0.2.1",
      user_agent: "Mozilla/5.0",
    });
  });

  it("inserts audit log for AI action without user", async () => {
    const supabase = createMockSupabase();
    const repository = createSupabaseAuditLogRepository(supabase.client);

    const entry: AuditLogEntry = {
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "ai",
      action: "reply.ai_approved",
      resourceType: "reply",
      resourceId: "00000000-0000-0000-0000-000000000003",
      metadata: { turnId: "turn-123", confidence: 0.95 },
    };

    await repository.insertAuditLog(entry);

    expect(supabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: null,
        actor_type: "ai",
        action: "reply.ai_approved",
        ip_address: null,
        user_agent: null,
      }),
    );
  });

  it("throws on database error", async () => {
    const supabase = createMockSupabase(new Error("Database error"));
    const repository = createSupabaseAuditLogRepository(supabase.client);

    const entry: AuditLogEntry = {
      workspaceId: "00000000-0000-0000-0000-000000000001",
      userId: null,
      actorType: "system",
      action: "workspace.settings_changed",
      resourceType: "workspace",
      resourceId: "00000000-0000-0000-0000-000000000001",
      metadata: {},
    };

    await expect(repository.insertAuditLog(entry)).rejects.toThrow("Database error");
  });
});
