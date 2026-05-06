import { describe, expect, it } from "vitest";
import {
  parseServerEnvironment,
  validateProductionReadiness,
} from "../../packages/core/src/index";

const productionLikeEnvironment = {
  APP_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://harwick.example",
  META_APP_ID: "meta-app",
  META_APP_SECRET: "meta-secret",
  META_WEBHOOK_VERIFY_TOKEN: "verify-token-long-enough",
  META_OAUTH_REDIRECT_URI: "https://harwick.example/api/meta/oauth/callback",
  CREDENTIAL_ENCRYPTION_KEY: "credential-secret-value",
  RETELL_API_KEY: "retell-api-key",
  RETELL_VOICE_ID: "retell-voice",
  OPENAI_API_KEY: "openai-key",
  STRIPE_SECRET_KEY: "sk_live_launch",
  STRIPE_WEBHOOK_SECRET: "whsec_launch",
  STRIPE_SOLO_MONTHLY_PRICE_ID: "price_solo_month",
  STRIPE_SOLO_YEARLY_PRICE_ID: "price_solo_year",
  STRIPE_TEAM_MONTHLY_PRICE_ID: "price_team_month",
  STRIPE_TEAM_YEARLY_PRICE_ID: "price_team_year",
  STRIPE_BROKERAGE_MONTHLY_PRICE_ID: "price_brokerage_month",
  STRIPE_BROKERAGE_YEARLY_PRICE_ID: "price_brokerage_year",
  GOOGLE_CALENDAR_CLIENT_ID: "google-client",
  GOOGLE_CALENDAR_CLIENT_SECRET: "google-secret",
  GOOGLE_CALENDAR_OAUTH_REDIRECT_URI: "https://harwick.example/api/integrations/google-calendar/callback",
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_AUTH_TOKEN: "twilio-token",
  TWILIO_PHONE_NUMBER: "+15550001111",
  AGENT_RECONCILE_CRON_SECRET: "cron-secret",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
} as const;

describe("launch runtime readiness", () => {
  it("accepts a complete production launch environment", () => {
    expect(validateProductionReadiness(parseServerEnvironment(productionLikeEnvironment))).toEqual([]);
  });

  it("blocks staging when it is pointed at live Stripe keys", () => {
    expect(validateProductionReadiness(parseServerEnvironment({
      ...productionLikeEnvironment,
      APP_ENV: "staging",
      NEXT_PUBLIC_APP_URL: "https://staging.harwick.example",
      META_OAUTH_REDIRECT_URI: "https://staging.harwick.example/api/meta/oauth/callback",
      GOOGLE_CALENDAR_OAUTH_REDIRECT_URI: "https://staging.harwick.example/api/integrations/google-calendar/callback",
      STRIPE_SECRET_KEY: "sk_live_wrong_for_staging",
    }))).toContain("STRIPE_SECRET_KEY_TEST_MODE");
  });

  it("blocks production when it is still pointed at Stripe test keys", () => {
    expect(validateProductionReadiness(parseServerEnvironment({
      ...productionLikeEnvironment,
      STRIPE_SECRET_KEY: "sk_test_wrong_for_production",
    }))).toContain("STRIPE_SECRET_KEY_LIVE_MODE");
  });
});
