import { describe, expect, it } from "vitest";
import {
  auditLocalLaunchEnvSources,
  formatLocalLaunchEnvSourceAudit,
  parseEnvFileNames,
} from "../../scripts/audit-local-launch-env-sources.mjs";

describe("local launch env source audit", () => {
  it("parses env variable names without exposing values", () => {
    const names = parseEnvFileNames(`
STRIPE_SECRET_KEY=sk_test_secret
export TWILIO_ACCOUNT_SID=AC123
# GOOGLE_CLIENT_ID=commented
INVALID LINE
`);

    expect([...names]).toEqual(["STRIPE_SECRET_KEY", "TWILIO_ACCOUNT_SID"]);
  });

  it("reports exact, alias, and missing local source coverage", () => {
    const sourcesByName = new Map<string, string[]>([
      ["STRIPE_SECRET_KEY", ["../receptionist-dashboard/.env.local"]],
      ["GOOGLE_CLIENT_ID", ["../receptionist-dashboard/.env.local"]],
      ["CRON_SECRET", ["../receptionist-dashboard/.env.local"]],
    ]);

    const report = auditLocalLaunchEnvSources({
      requiredNames: ["STRIPE_SECRET_KEY", "GOOGLE_CALENDAR_CLIENT_ID", "RETELL_VOICE_ID"],
      requiredAlternatives: [{
        label: "AGENT_RECONCILE_CRON_SECRET_OR_CRON_SECRET",
        names: ["AGENT_RECONCILE_CRON_SECRET", "CRON_SECRET"],
      }],
      sourcesByName,
    });

    expect(report.ok).toBe(false);
    expect(report.required).toEqual([
      {
        name: "STRIPE_SECRET_KEY",
        status: "exact",
        exact: [{ name: "STRIPE_SECRET_KEY", sources: ["../receptionist-dashboard/.env.local"] }],
        alias: [],
      },
      {
        name: "GOOGLE_CALENDAR_CLIENT_ID",
        status: "alias",
        exact: [],
        alias: [{ name: "GOOGLE_CLIENT_ID", sources: ["../receptionist-dashboard/.env.local"] }],
      },
      {
        name: "RETELL_VOICE_ID",
        status: "missing",
        exact: [],
        alias: [],
      },
    ]);
    expect(report.alternatives[0]).toMatchObject({
      status: "exact",
      exact: [{ name: "CRON_SECRET", sources: ["../receptionist-dashboard/.env.local"] }],
    });
  });

  it("formats a value-safe report", () => {
    const report = auditLocalLaunchEnvSources({
      requiredNames: ["STRIPE_SECRET_KEY", "RETELL_VOICE_ID"],
      requiredAlternatives: [],
      sourcesByName: new Map([["STRIPE_SECRET_KEY", ["../receptionist-dashboard/.env.local"]]]),
    });

    const formatted = formatLocalLaunchEnvSourceAudit(report);

    expect(formatted).toContain("exact   STRIPE_SECRET_KEY");
    expect(formatted).toContain("missing RETELL_VOICE_ID");
    expect(formatted).not.toContain("sk_");
  });
});
