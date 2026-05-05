import type { RealtyOpsSupabaseClient } from "./server-client";

export type WorkspacePolicyNarrativeRepository = {
  read(workspaceId: string): Promise<string | null>;
  write(params: {
    workspaceId: string;
    body: string;
    source: "generated" | "manual";
  }): Promise<void>;
};

export function createSupabaseWorkspacePolicyNarrativeRepository(
  supabase: RealtyOpsSupabaseClient,
): WorkspacePolicyNarrativeRepository {
  return {
    async read(workspaceId) {
      const { data, error } = await supabase
        .from("workspaces")
        .select("policy_narrative")
        .eq("id", workspaceId)
        .maybeSingle<{ policy_narrative: string | null }>();

      if (error !== null) {
        throw error;
      }
      const body = data?.policy_narrative ?? null;
      return body === null || body.trim().length === 0 ? null : body;
    },

    async write(params) {
      const { error } = await supabase
        .from("workspaces")
        .update({
          policy_narrative: params.body,
          policy_narrative_generated_at: new Date().toISOString(),
          policy_narrative_source: params.source,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .eq("id", params.workspaceId);

      if (error !== null) {
        throw error;
      }
    },
  };
}
