import type { AuditLogEntry } from "@realty-ops/core";
import type { Json, TablesInsert } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type AuditLogRepository = {
  insertAuditLog(entry: AuditLogEntry): Promise<void>;
  listPolicyShadowSignals(params: {
    sinceIso: string;
    limit: number;
  }): Promise<HarwickPolicyShadowSignal[]>;
};

export type HarwickPolicyShadowSignal = {
  workspaceId: string;
  turnId: string | null;
  agree: boolean;
  deterministicAutoExecute: boolean;
  modelSelfGateAutoExecute: boolean;
  deterministicReason: string | null;
  modelSelfGateReason: string | null;
  createdAt: string;
};

type PolicyShadowAuditLogRow = {
  workspace_id: string;
  resource_id: string | null;
  metadata: Json;
  created_at: string;
};

function metadataRecord(metadata: Json): Record<string, unknown> {
  return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
    ? metadata
    : {};
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

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

    async listPolicyShadowSignals(params) {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("workspace_id, resource_id, metadata, created_at")
        .eq("action", "harwick_ai.policy_shadow")
        .gte("created_at", params.sinceIso)
        .order("created_at", { ascending: false })
        .limit(params.limit)
        .returns<PolicyShadowAuditLogRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).flatMap((row): HarwickPolicyShadowSignal[] => {
        const metadata = metadataRecord(row.metadata);
        const agree = readBoolean(metadata["agree"]);
        const deterministicAutoExecute = readBoolean(metadata["deterministicAutoExecute"]);
        const modelSelfGateAutoExecute = readBoolean(metadata["modelSelfGateAutoExecute"]);
        if (agree === null || deterministicAutoExecute === null || modelSelfGateAutoExecute === null) {
          return [];
        }

        return [{
          workspaceId: row.workspace_id,
          turnId: row.resource_id,
          agree,
          deterministicAutoExecute,
          modelSelfGateAutoExecute,
          deterministicReason: readString(metadata["deterministicReason"]),
          modelSelfGateReason: readString(metadata["modelSelfGateReason"]),
          createdAt: row.created_at,
        }];
      });
    },
  };
}
