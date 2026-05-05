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
  LISTING_PROVIDER: OptionalListingProviderSchema,
  REPLIERS_API_KEY: OptionalNonEmptyStringSchema,
  REPLIERS_BOARD_ID: OptionalPositiveIntegerSchema,
  NEXT_PUBLIC_SUPABASE_URL: z.string().trim().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
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
  if (environment.RETELL_CONVERSATION_FLOW_TEMPLATE_ID === undefined) {
    missing.push("RETELL_CONVERSATION_FLOW_TEMPLATE_ID");
  }
  if (environment.RETELL_VOICE_ID === undefined) {
    missing.push("RETELL_VOICE_ID");
  }
  if (environment.NEXT_PUBLIC_APP_URL.includes("localhost")) {
    missing.push("NEXT_PUBLIC_APP_URL_PUBLIC_HOST");
  }

  return missing;
}
