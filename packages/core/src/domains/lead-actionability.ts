import { z } from "zod";
import { IsoDateTimeSchema, ProviderIdSchema, UuidSchema } from "./common.js";
import {
  LeadIntentSchema,
  LeadScoreSchema,
  LeadSourceChannelSchema,
  LeadStatusSchema,
} from "./lead.js";

export const HarwickLeadActionabilityStateSchema = z.enum([
  "hidden",
  "callback",
  "nurture",
  "qualified",
]);

export const HarwickLeadActionabilityInputSchema = z.object({
  sourceChannel: LeadSourceChannelSchema,
  status: LeadStatusSchema,
  intent: LeadIntentSchema,
  score: LeadScoreSchema,
  assignedAgentId: UuidSchema.nullable(),
  nextFollowUpAt: IsoDateTimeSchema.nullable(),
  followUpBossContactId: ProviderIdSchema.nullable(),
});

export const HarwickLeadActionabilitySchema = z.object({
  shouldShow: z.boolean(),
  state: HarwickLeadActionabilityStateSchema,
  reason: z.string().trim().min(1).max(240),
});

export type HarwickLeadActionabilityInput = z.infer<typeof HarwickLeadActionabilityInputSchema>;
export type HarwickLeadActionabilityState = z.infer<typeof HarwickLeadActionabilityStateSchema>;
export type HarwickLeadActionability = z.infer<typeof HarwickLeadActionabilitySchema>;

export function classifyHarwickLeadActionability(input: unknown): HarwickLeadActionability {
  const lead = HarwickLeadActionabilityInputSchema.parse(input);

  if (
    lead.status === "closed_won"
    || lead.status === "closed_lost"
    || lead.status === "archived"
    || lead.intent === "spam"
  ) {
    return {
      shouldShow: false,
      state: "hidden",
      reason: "closed or spam leads stay out of Harwick work surfaces.",
    };
  }

  if (lead.sourceChannel === "call") {
    return {
      shouldShow: true,
      state: "callback",
      reason: "voice leads stay visible until the call summary is worked or handed off.",
    };
  }

  if (
    lead.status === "hot"
    || lead.status === "qualified"
    || lead.status === "assigned"
    || lead.status === "appointment_booked"
    || lead.status === "active_client"
    || lead.assignedAgentId !== null
    || lead.score >= 45
    || lead.intent === "high"
    || lead.intent === "medium"
  ) {
    return {
      shouldShow: true,
      state: "qualified",
      reason: "qualified leads are ready for active Harwick routing, reply, and CRM work.",
    };
  }

  if (
    lead.status === "nurture"
    || lead.nextFollowUpAt !== null
    || lead.followUpBossContactId !== null
  ) {
    return {
      shouldShow: true,
      state: "nurture",
      reason: "nurture leads stay visible only when Harwick has scheduled follow-up work.",
    };
  }

  return {
    shouldShow: false,
    state: "hidden",
    reason: "low-signal leads stay hidden until they qualify or enter nurture.",
  };
}
