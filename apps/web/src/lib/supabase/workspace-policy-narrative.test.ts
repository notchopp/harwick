import { describe, expect, it, vi } from "vitest";
import { createSupabaseWorkspacePolicyNarrativeRepository } from "./workspace-policy-narrative";
import type { RealtyOpsSupabaseClient } from "./server-client";

const workspaceId = "00000000-0000-0000-0000-000000000001";

function createReadClient(data: {
  policy_narrative: string | null;
  policy_narrative_source: "generated" | "manual" | null;
  policy_narrative_generated_at: string | null;
}) {
  const maybeSingle = vi.fn(() => ({ data, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    client: { from } as unknown as RealtyOpsSupabaseClient,
    from,
    select,
    eq,
    maybeSingle,
  };
}

function createWriteClient() {
  const eq = vi.fn(() => ({ error: null }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return {
    client: { from } as unknown as RealtyOpsSupabaseClient,
    from,
    update,
    eq,
  };
}

describe("createSupabaseWorkspacePolicyNarrativeRepository", () => {
  it("reads policy narrative metadata from the workspace", async () => {
    const supabase = createReadClient({
      policy_narrative: "Always pause on legal questions.",
      policy_narrative_source: "manual",
      policy_narrative_generated_at: "2026-05-05T12:00:00.000Z",
    });
    const repository = createSupabaseWorkspacePolicyNarrativeRepository(supabase.client);

    await expect(repository.readRecord(workspaceId)).resolves.toEqual({
      body: "Always pause on legal questions.",
      source: "manual",
      generatedAt: "2026-05-05T12:00:00.000Z",
    });
    expect(supabase.from).toHaveBeenCalledWith("workspaces");
    expect(supabase.eq).toHaveBeenCalledWith("id", workspaceId);
  });

  it("writes manual policy narrative without untyped update casts", async () => {
    const supabase = createWriteClient();
    const repository = createSupabaseWorkspacePolicyNarrativeRepository(supabase.client);

    await repository.write({
      workspaceId,
      body: "Every closed lead gets a thank-you and a 6-month check-in.",
      source: "manual",
    });

    expect(supabase.update).toHaveBeenCalledWith(expect.objectContaining({
      policy_narrative: "Every closed lead gets a thank-you and a 6-month check-in.",
      policy_narrative_source: "manual",
    }));
    expect(supabase.eq).toHaveBeenCalledWith("id", workspaceId);
  });
});
