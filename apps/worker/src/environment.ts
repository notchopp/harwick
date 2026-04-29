import { z } from "zod";

export const WorkerEnvironmentSchema = z.object({
  APP_ENV: z.enum(["development", "staging", "production"]).default("development"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().trim().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
  CREDENTIAL_ENCRYPTION_KEY: z.string().trim().min(16).optional(),
  WORKER_ID: z.string().trim().min(1).default("realty-ops-worker"),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(60_000).default(5_000),
  WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  FOLLOWUPBOSS_API_KEY: z.string().trim().min(1).optional(),
});

export type WorkerEnvironment = z.infer<typeof WorkerEnvironmentSchema>;

export function parseWorkerEnvironment(input: unknown = process.env): WorkerEnvironment {
  return WorkerEnvironmentSchema.parse(input);
}
