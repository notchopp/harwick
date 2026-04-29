import { describe, expect, it } from "vitest";
import { parseServerEnvironment } from "./environment.js";

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
});
