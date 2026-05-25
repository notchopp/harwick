import { z } from "zod";

export const AppEnvironmentSchema = z.enum(["development", "staging", "production"]);

const OptionalNonEmptyStringSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}, z.string().trim().min(1).optional());

const OptionalNonEmptyUrlSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}, z.string().trim().url().optional());

const OptionalPositiveIntegerSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}, z.coerce.number().int().positive().optional());

const OptionalListingProviderSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
}, z.enum(["repliers"]).optional());

const ServerEnvironmentBaseSchema = z.object({
  APP_ENV: AppEnvironmentSchema.default("development"),
  NEXT_PUBLIC_APP_URL: z.string().trim().url(),
  META_APP_ID: z.string().trim().min(1),
  META_APP_SECRET: z.string().trim().min(1),
  META_WEBHOOK_VERIFY_TOKEN: z.string().trim().min(16),
  META_OAUTH_REDIRECT_URI: OptionalNonEmptyUrlSchema,
  CREDENTIAL_ENCRYPTION_KEY: OptionalNonEmptyStringSchema.pipe(z.string().trim().min(16).optional()),
  RETELL_API_KEY: z.string().trim().min(1),
  RETELL_CONVERSATION_FLOW_TEMPLATE_ID: z.string().trim().min(1).optional(),
  RETELL_VOICE_ID: z.string().trim().min(1).optional(),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_REPLY_MODEL: z.string().trim().min(1).default("gpt-5.2"),
  // Small-model tier for cheap classification, routing-assist, lite reasoning.
  // Defaults to gpt-4o-mini if unset; brokerages can swap to Haiku 3.5 or
  // a Llama-via-Groq deployment by setting this env.
  OPENAI_SMALL_MODEL: z.string().trim().min(1).default("gpt-4o-mini"),
  GOOGLE_CALENDAR_CLIENT_ID: OptionalNonEmptyStringSchema,
  GOOGLE_CALENDAR_CLIENT_SECRET: OptionalNonEmptyStringSchema,
  GOOGLE_CALENDAR_OAUTH_REDIRECT_URI: OptionalNonEmptyUrlSchema,
  TWILIO_ACCOUNT_SID: OptionalNonEmptyStringSchema,
  TWILIO_AUTH_TOKEN: OptionalNonEmptyStringSchema,
  TWILIO_PHONE_NUMBER: OptionalNonEmptyStringSchema,
  LISTING_PROVIDER: OptionalListingProviderSchema,
  REPLIERS_API_KEY: OptionalNonEmptyStringSchema,
  REPLIERS_BOARD_ID: OptionalPositiveIntegerSchema,
  STRIPE_SECRET_KEY: OptionalNonEmptyStringSchema,
  STRIPE_WEBHOOK_SECRET: OptionalNonEmptyStringSchema,
  STRIPE_SOLO_MONTHLY_PRICE_ID: OptionalNonEmptyStringSchema,
  STRIPE_SOLO_YEARLY_PRICE_ID: OptionalNonEmptyStringSchema,
  STRIPE_TEAM_MONTHLY_PRICE_ID: OptionalNonEmptyStringSchema,
  STRIPE_TEAM_YEARLY_PRICE_ID: OptionalNonEmptyStringSchema,
  STRIPE_BROKERAGE_MONTHLY_PRICE_ID: OptionalNonEmptyStringSchema,
  STRIPE_BROKERAGE_YEARLY_PRICE_ID: OptionalNonEmptyStringSchema,
  RESEND_API_KEY: OptionalNonEmptyStringSchema,
  AGENT_RECONCILE_CRON_SECRET: OptionalNonEmptyStringSchema,
  CRON_SECRET: OptionalNonEmptyStringSchema,
  NEXT_PUBLIC_SUPABASE_URL: z.string().trim().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
  // Sentry DSN — optional. When undefined the @sentry/nextjs SDK silently
  // no-ops (initialization with no DSN never emits events), which is the
  // desired behavior for dev / unconfigured deploys.
  SENTRY_DSN: OptionalNonEmptyStringSchema,
});

export const ServerEnvironmentSchema = ServerEnvironmentBaseSchema.superRefine((value, context) => {
  if (value.LISTING_PROVIDER === "repliers" && value.REPLIERS_API_KEY === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["REPLIERS_API_KEY"],
      message: "REPLIERS_API_KEY is required when LISTING_PROVIDER is repliers",
    });
  }
});

export const SupabaseRuntimeEnvironmentSchema = ServerEnvironmentBaseSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
  SUPABASE_SERVICE_ROLE_KEY: true,
});

export const SupabasePublicEnvironmentSchema = ServerEnvironmentBaseSchema.pick({
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
});

export type AppEnvironment = z.infer<typeof AppEnvironmentSchema>;
export type ServerEnvironment = z.infer<typeof ServerEnvironmentSchema>;
export type SupabaseRuntimeEnvironment = z.infer<typeof SupabaseRuntimeEnvironmentSchema>;
export type SupabasePublicEnvironment = z.infer<typeof SupabasePublicEnvironmentSchema>;

export function parseServerEnvironment(input: unknown): ServerEnvironment {
  return ServerEnvironmentSchema.parse(input);
}

export function parseSupabaseRuntimeEnvironment(input: unknown): SupabaseRuntimeEnvironment {
  return SupabaseRuntimeEnvironmentSchema.parse(input);
}

export function parseSupabasePublicEnvironment(input: unknown): SupabasePublicEnvironment {
  return SupabasePublicEnvironmentSchema.parse(input);
}

export function validateProductionReadiness(environment: ServerEnvironment): string[] {
  if (environment.APP_ENV === "development") {
    return [];
  }

  const missing: string[] = [];
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    missing.push("CREDENTIAL_ENCRYPTION_KEY");
  }
  if (environment.OPENAI_API_KEY === undefined) {
    missing.push("OPENAI_API_KEY");
  }
  if (environment.RETELL_VOICE_ID === undefined) {
    missing.push("RETELL_VOICE_ID");
  }
  if (environment.STRIPE_SECRET_KEY === undefined) {
    missing.push("STRIPE_SECRET_KEY");
  }
  if (environment.STRIPE_WEBHOOK_SECRET === undefined) {
    missing.push("STRIPE_WEBHOOK_SECRET");
  }
  if (environment.STRIPE_SOLO_MONTHLY_PRICE_ID === undefined) {
    missing.push("STRIPE_SOLO_MONTHLY_PRICE_ID");
  }
  if (environment.STRIPE_SOLO_YEARLY_PRICE_ID === undefined) {
    missing.push("STRIPE_SOLO_YEARLY_PRICE_ID");
  }
  if (environment.STRIPE_TEAM_MONTHLY_PRICE_ID === undefined) {
    missing.push("STRIPE_TEAM_MONTHLY_PRICE_ID");
  }
  if (environment.STRIPE_TEAM_YEARLY_PRICE_ID === undefined) {
    missing.push("STRIPE_TEAM_YEARLY_PRICE_ID");
  }
  if (environment.STRIPE_BROKERAGE_MONTHLY_PRICE_ID === undefined) {
    missing.push("STRIPE_BROKERAGE_MONTHLY_PRICE_ID");
  }
  if (environment.STRIPE_BROKERAGE_YEARLY_PRICE_ID === undefined) {
    missing.push("STRIPE_BROKERAGE_YEARLY_PRICE_ID");
  }
  if (environment.APP_ENV === "staging" && environment.STRIPE_SECRET_KEY !== undefined && !environment.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
    missing.push("STRIPE_SECRET_KEY_TEST_MODE");
  }
  if (environment.APP_ENV === "production" && environment.STRIPE_SECRET_KEY !== undefined && !environment.STRIPE_SECRET_KEY.startsWith("sk_live_")) {
    missing.push("STRIPE_SECRET_KEY_LIVE_MODE");
  }
  if (environment.META_OAUTH_REDIRECT_URI === undefined) {
    missing.push("META_OAUTH_REDIRECT_URI");
  }
  if (environment.GOOGLE_CALENDAR_CLIENT_ID === undefined) {
    missing.push("GOOGLE_CALENDAR_CLIENT_ID");
  }
  if (environment.GOOGLE_CALENDAR_CLIENT_SECRET === undefined) {
    missing.push("GOOGLE_CALENDAR_CLIENT_SECRET");
  }
  if (environment.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI === undefined) {
    missing.push("GOOGLE_CALENDAR_OAUTH_REDIRECT_URI");
  }
  if (environment.TWILIO_ACCOUNT_SID === undefined) {
    missing.push("TWILIO_ACCOUNT_SID");
  }
  if (environment.TWILIO_AUTH_TOKEN === undefined) {
    missing.push("TWILIO_AUTH_TOKEN");
  }
  if (environment.TWILIO_PHONE_NUMBER === undefined) {
    missing.push("TWILIO_PHONE_NUMBER");
  }
  if (environment.AGENT_RECONCILE_CRON_SECRET === undefined && environment.CRON_SECRET === undefined) {
    missing.push("AGENT_RECONCILE_CRON_SECRET_OR_CRON_SECRET");
  }
  if (environment.NEXT_PUBLIC_APP_URL.includes("localhost")) {
    missing.push("NEXT_PUBLIC_APP_URL_PUBLIC_HOST");
  }

  return missing;
}
