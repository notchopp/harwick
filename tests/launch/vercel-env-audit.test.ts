import { describe, expect, it } from "vitest";
import {
  auditConfiguredEnvironmentNames,
  parseVercelEnvListOutput,
} from "../../scripts/audit-vercel-env.mjs";

describe("vercel environment audit", () => {
  it("parses configured Vercel env names without reading values", () => {
    const names = parseVercelEnvListOutput(`
 name                               value               environments        created
 SUPABASE_SERVICE_ROLE_KEY          Encrypted           Production          2d ago
 RETELL_VOICE_ID                    Encrypted           Production          1m ago
 Vercel CLI 48.1.0
`);

    expect([...names]).toEqual(["SUPABASE_SERVICE_ROLE_KEY", "RETELL_VOICE_ID"]);
  });

  it("does not require the optional Retell template flow env", () => {
    const configured = [
      "APP_ENV",
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "META_APP_ID",
      "META_APP_SECRET",
      "META_WEBHOOK_VERIFY_TOKEN",
      "META_OAUTH_REDIRECT_URI",
      "CREDENTIAL_ENCRYPTION_KEY",
      "OPENAI_API_KEY",
      "RETELL_API_KEY",
      "RETELL_VOICE_ID",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_SOLO_MONTHLY_PRICE_ID",
      "STRIPE_SOLO_YEARLY_PRICE_ID",
      "STRIPE_TEAM_MONTHLY_PRICE_ID",
      "STRIPE_TEAM_YEARLY_PRICE_ID",
      "STRIPE_BROKERAGE_MONTHLY_PRICE_ID",
      "STRIPE_BROKERAGE_YEARLY_PRICE_ID",
      "GOOGLE_CALENDAR_CLIENT_ID",
      "GOOGLE_CALENDAR_CLIENT_SECRET",
      "GOOGLE_CALENDAR_OAUTH_REDIRECT_URI",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
      "CRON_SECRET",
    ];

    expect(auditConfiguredEnvironmentNames(configured)).toEqual({
      ok: true,
      missing: [],
      missingAlternatives: [],
    });
  });

  it("reports missing required names and cron secret alternatives", () => {
    const report = auditConfiguredEnvironmentNames([
      "APP_ENV",
      "NEXT_PUBLIC_APP_URL",
    ]);

    expect(report.ok).toBe(false);
    expect(report.missing).toContain("RETELL_VOICE_ID");
    expect(report.missing).toContain("STRIPE_SECRET_KEY");
    expect(report.missingAlternatives).toEqual(["AGENT_RECONCILE_CRON_SECRET_OR_CRON_SECRET"]);
  });
});
