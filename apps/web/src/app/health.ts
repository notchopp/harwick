import { z } from "zod";

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("realty-ops-web"),
});

export function getHealthResponse(): z.infer<typeof HealthResponseSchema> {
  return HealthResponseSchema.parse({
    ok: true,
    service: "realty-ops-web",
  });
}

