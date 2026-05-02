import type { AuditLogEntry } from "@realty-ops/core";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type AuditLogInsertRow = {
  workspace_id: string;
  user_id: string | null;
  actor_type: AuditLogEntry["actorType"];
  action: AuditLogEntry["action"];
  resource_type: AuditLogEntry["resourceType"];
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
};

export type AuditLogRepository = {
  insertAuditLog(entry: AuditLogEntry): Promise<void>;
};

export function createSupabaseAuditLogRepository(
  supabase: RealtyOpsSupabaseClient,
): AuditLogRepository {
  return {
    async insertAuditLog(entry) {
      const row: AuditLogInsertRow = {
        workspace_id: entry.workspaceId,
        user_id: entry.userId,
        actor_type: entry.actorType,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId,
        metadata: entry.metadata,
        ip_address: entry.ipAddress ?? null,
        user_agent: entry.userAgent ?? null,
      };

      const { error } = await supabase.from("audit_logs").insert(row);

      if (error !== null) {
        throw error;
      }
    },
  };
}
