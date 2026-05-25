import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260524000200_align_harwick_policy_meta_tools.sql"),
  "utf8",
);

describe("Harwick policy migration alignment", () => {
  it("aligns DB defaults with canonical runtime policy allowlists", () => {
    expect(migrationSql).toContain("alter column allowed_auto_actions set default");
    expect(migrationSql).toContain("alter column allowed_auto_tools set default");
    expect(migrationSql).toContain("'send_meta_message'");
    expect(migrationSql).toContain("'send_meta_reply'");
    expect(migrationSql).toContain("'send_meta_dm'");
    expect(migrationSql).toContain("'dispatch_subagent'");
  });

  it("backfills existing policy rows that predate the canonical Meta tool", () => {
    expect(migrationSql).toContain("update public.harwick_ai_automation_policies");
    expect(migrationSql).toContain("allowed_auto_tools");
    expect(migrationSql).toContain("allowed_auto_actions");
    expect(migrationSql).toContain("where not (");
    expect(migrationSql).toContain("'send_meta_message' = any(allowed_auto_tools)");
    expect(migrationSql).toContain("'dispatch_subagent' = any(allowed_auto_actions)");
  });
});
