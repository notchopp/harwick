import type { AuditLogEntry } from "@realty-ops/core";
import type { Json, TablesInsert } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type AuditLogRepository = {
  insertAuditLog(entry: AuditLogEntry): Promise<void>;
};

export function createSupabaseAuditLogRepository(
  supabase: RealtyOpsSupabaseClient,
): AuditLogRepository {
  return {
    async insertAuditLog(entry) {
      const row: TablesInsert<"audit_logs"> = {
        workspace_id: entry.workspaceId,
        user_id: entry.userId,
        actor_type: entry.actorType,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId,
        metadata: (entry.metadata ?? {}) as Json,
        ip_address: entry.ipAddress ?? null,
        user_agent: entry.userAgent ?? null,
      };

      const { error } = await supabase.from("audit_logs").insert([row]);

      if (error !== null) {
        throw error;
      }
    },
  };
}
