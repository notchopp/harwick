import type { TablesUpdate } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type WorkspacePolicyNarrativeRecord = {
  body: string | null;
  source: "generated" | "manual" | null;
  generatedAt: string | null;
};

export type WorkspacePolicyNarrativeRepository = {
  read(workspaceId: string): Promise<string | null>;
  readRecord(workspaceId: string): Promise<WorkspacePolicyNarrativeRecord>;
  write(params: {
    workspaceId: string;
    body: string;
    source: "generated" | "manual";
  }): Promise<void>;
};

export function createSupabaseWorkspacePolicyNarrativeRepository(
  supabase: RealtyOpsSupabaseClient,
): WorkspacePolicyNarrativeRepository {
  async function readRecord(workspaceId: string): Promise<WorkspacePolicyNarrativeRecord> {
    const { data, error } = await supabase
      .from("workspaces")
      .select("policy_narrative, policy_narrative_source, policy_narrative_generated_at")
      .eq("id", workspaceId)
      .maybeSingle<{
        policy_narrative: string | null;
        policy_narrative_source: "generated" | "manual" | null;
        policy_narrative_generated_at: string | null;
      }>();

    if (error !== null) {
      throw error;
    }
    return {
      body: data?.policy_narrative ?? null,
      source: data?.policy_narrative_source ?? null,
      generatedAt: data?.policy_narrative_generated_at ?? null,
    };
  }

  return {
    async read(workspaceId) {
      const record = await readRecord(workspaceId);
      return record.body === null || record.body.trim().length === 0 ? null : record.body;
    },

    readRecord,

    async write(params) {
      const update: TablesUpdate<"workspaces"> = {
        policy_narrative: params.body,
        policy_narrative_generated_at: new Date().toISOString(),
        policy_narrative_source: params.source,
      };
      const { error } = await supabase
        .from("workspaces")
        .update(update)
        .eq("id", params.workspaceId);

      if (error !== null) {
        throw error;
      }
    },
  };
}
