import { describe, expect, it } from "vitest";
import { parseServerEnvironment, validateProductionReadiness } from "./environment.js";

const validEnvironment = {
  APP_ENV: "development",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  META_APP_ID: "meta-app",
  META_APP_SECRET: "meta-secret",
  META_WEBHOOK_VERIFY_TOKEN: "verify-token-long-enough",
  RETELL_API_KEY: "retell-api-key",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

describe("parseServerEnvironment", () => {
  it("parses required server environment", () => {
    expect(parseServerEnvironment(validEnvironment).APP_ENV).toBe("development");
  });

  it("rejects missing webhook verification token", () => {
    const invalidEnvironment: Record<string, unknown> = { ...validEnvironment };
    delete invalidEnvironment["META_WEBHOOK_VERIFY_TOKEN"];

    expect(() => parseServerEnvironment(invalidEnvironment)).toThrow();
  });

  it("requires a Repliers API key when the listing provider is enabled", () => {
    expect(() => parseServerEnvironment({
      ...validEnvironment,
      LISTING_PROVIDER: "repliers",
    })).toThrow(/REPLIERS_API_KEY/i);
  });

  it("accepts blank optional listing-provider variables", () => {
    expect(parseServerEnvironment({
      ...validEnvironment,
      LISTING_PROVIDER: "",
      REPLIERS_API_KEY: "",
      REPLIERS_BOARD_ID: "",
    }).LISTING_PROVIDER).toBeUndefined();
  });

  it("reports missing staging and production runtime requirements", () => {
    expect(validateProductionReadiness(parseServerEnvironment({
      ...validEnvironment,
      APP_ENV: "production",
    }))).toEqual(expect.arrayContaining([
      "CREDENTIAL_ENCRYPTION_KEY",
      "OPENAI_API_KEY",
      "RETELL_VOICE_ID",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_SOLO_MONTHLY_PRICE_ID",
      "STRIPE_SOLO_YEARLY_PRICE_ID",
      "STRIPE_TEAM_MONTHLY_PRICE_ID",
      "STRIPE_TEAM_YEARLY_PRICE_ID",
      "STRIPE_BROKERAGE_MONTHLY_PRICE_ID",
      "STRIPE_BROKERAGE_YEARLY_PRICE_ID",
      "META_OAUTH_REDIRECT_URI",
      "GOOGLE_CALENDAR_CLIENT_ID",
      "GOOGLE_CALENDAR_CLIENT_SECRET",
      "GOOGLE_CALENDAR_OAUTH_REDIRECT_URI",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
      "AGENT_RECONCILE_CRON_SECRET_OR_CRON_SECRET",
      "NEXT_PUBLIC_APP_URL_PUBLIC_HOST",
    ]));
  });

  it("rejects live Stripe keys in staging and test Stripe keys in production", () => {
    const readyEnvironment = {
      ...validEnvironment,
      NEXT_PUBLIC_APP_URL: "https://staging.harwick.example",
      META_OAUTH_REDIRECT_URI: "https://staging.harwick.example/api/meta/oauth/callback",
      CREDENTIAL_ENCRYPTION_KEY: "credential-secret-value",
      RETELL_CONVERSATION_FLOW_TEMPLATE_ID: "retell-flow",
      RETELL_VOICE_ID: "retell-voice",
      OPENAI_API_KEY: "openai-key",
      STRIPE_SECRET_KEY: "sk_live_wrong_for_staging",
      STRIPE_WEBHOOK_SECRET: "whsec_staging",
      STRIPE_SOLO_MONTHLY_PRICE_ID: "price_solo_month",
      STRIPE_SOLO_YEARLY_PRICE_ID: "price_solo_year",
      STRIPE_TEAM_MONTHLY_PRICE_ID: "price_team_month",
      STRIPE_TEAM_YEARLY_PRICE_ID: "price_team_year",
      STRIPE_BROKERAGE_MONTHLY_PRICE_ID: "price_brokerage_month",
      STRIPE_BROKERAGE_YEARLY_PRICE_ID: "price_brokerage_year",
      GOOGLE_CALENDAR_CLIENT_ID: "google-client",
      GOOGLE_CALENDAR_CLIENT_SECRET: "google-secret",
      GOOGLE_CALENDAR_OAUTH_REDIRECT_URI: "https://staging.harwick.example/api/integrations/google-calendar/callback",
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_AUTH_TOKEN: "twilio-token",
      TWILIO_PHONE_NUMBER: "+15550001111",
      AGENT_RECONCILE_CRON_SECRET: "cron-secret",
    };

    expect(validateProductionReadiness(parseServerEnvironment({
      ...readyEnvironment,
      APP_ENV: "staging",
    }))).toContain("STRIPE_SECRET_KEY_TEST_MODE");

    expect(validateProductionReadiness(parseServerEnvironment({
      ...readyEnvironment,
      APP_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://harwick.example",
      META_OAUTH_REDIRECT_URI: "https://harwick.example/api/meta/oauth/callback",
      GOOGLE_CALENDAR_OAUTH_REDIRECT_URI: "https://harwick.example/api/integrations/google-calendar/callback",
      STRIPE_SECRET_KEY: "sk_test_wrong_for_production",
    }))).toContain("STRIPE_SECRET_KEY_LIVE_MODE");
  });

  it("does not require a Retell template flow when a voice is configured", () => {
    const readyEnvironment = parseServerEnvironment({
      ...validEnvironment,
      APP_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://harwick.example",
      META_OAUTH_REDIRECT_URI: "https://harwick.example/api/meta/oauth/callback",
      CREDENTIAL_ENCRYPTION_KEY: "credential-secret-value",
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
    });

    expect(validateProductionReadiness(readyEnvironment)).not.toContain("RETELL_CONVERSATION_FLOW_TEMPLATE_ID");
  });
});
