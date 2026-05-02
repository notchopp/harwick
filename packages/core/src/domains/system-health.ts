import { z } from "zod";

export const PublicSystemHealthStatusSchema = z.enum(["healthy", "degraded", "needs_setup"]);

export const PublicSystemHealthItemSchema = z.object({
  key: z.enum([
    "lead_intake",
    "harwick_ai",
    "voice_system",
    "listing_system",
    "crm_sync",
    "background_jobs",
  ]),
  label: z.string().trim().min(1).max(80),
  status: PublicSystemHealthStatusSchema,
  detail: z.string().trim().min(1).max(240),
});

export const PublicSystemHealthResponseSchema = z.object({
  status: PublicSystemHealthStatusSchema,
  checkedAt: z.string().datetime(),
  items: z.array(PublicSystemHealthItemSchema),
});

export type PublicSystemHealthStatus = z.infer<typeof PublicSystemHealthStatusSchema>;
export type PublicSystemHealthItem = z.infer<typeof PublicSystemHealthItemSchema>;
export type PublicSystemHealthResponse = z.infer<typeof PublicSystemHealthResponseSchema>;

function summarize(items: PublicSystemHealthItem[]): PublicSystemHealthStatus {
  if (items.some((item) => item.status === "needs_setup")) return "needs_setup";
  if (items.some((item) => item.status === "degraded")) return "degraded";
  return "healthy";
}

export function buildPublicSystemHealth(params: {
  checkedAt: string;
  hasSocialIntake: boolean;
  hasHarwickAi: boolean;
  hasVoiceSystem: boolean;
  hasListingSystem: boolean;
  hasCrmSync: boolean;
  hasBackgroundJobs: boolean;
}): PublicSystemHealthResponse {
  const items: PublicSystemHealthItem[] = [
    {
      key: "lead_intake",
      label: "Lead intake",
      status: params.hasSocialIntake ? "healthy" : "needs_setup",
      detail: params.hasSocialIntake ? "Social lead intake is configured." : "Connect social intake before automatic replies.",
    },
    {
      key: "harwick_ai",
      label: "Harwick AI",
      status: params.hasHarwickAi ? "healthy" : "needs_setup",
      detail: params.hasHarwickAi ? "AI runtime is ready to evaluate conversations." : "Configure the AI runtime before auto-send.",
    },
    {
      key: "voice_system",
      label: "Voice system",
      status: params.hasVoiceSystem ? "healthy" : "needs_setup",
      detail: params.hasVoiceSystem ? "Voice intake is configured." : "Provision voice intake before call handling.",
    },
    {
      key: "listing_system",
      label: "Listing system",
      status: params.hasListingSystem ? "healthy" : "needs_setup",
      detail: params.hasListingSystem ? "Listing context can be used in replies." : "Connect or enter listings for listing-aware answers.",
    },
    {
      key: "crm_sync",
      label: "CRM sync",
      status: params.hasCrmSync ? "healthy" : "needs_setup",
      detail: params.hasCrmSync ? "Qualified lead sync is configured." : "Connect CRM sync before automatic handoff.",
    },
    {
      key: "background_jobs",
      label: "Background jobs",
      status: params.hasBackgroundJobs ? "healthy" : "needs_setup",
      detail: params.hasBackgroundJobs ? "Background work has required runtime credentials." : "Configure background job credentials before production.",
    },
  ];

  return PublicSystemHealthResponseSchema.parse({
    status: summarize(items),
    checkedAt: params.checkedAt,
    items,
  });
}
