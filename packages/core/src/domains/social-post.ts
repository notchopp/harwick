import { z } from "zod";
import { IsoDateTimeSchema, ProviderIdSchema, UuidSchema } from "./common.js";

export const SocialProviderSchema = z.enum(["meta"]);

export const SocialPostContextSchema = z.object({
  workspaceId: UuidSchema,
  provider: SocialProviderSchema,
  providerAccountId: ProviderIdSchema,
  sourcePostId: ProviderIdSchema,
  sourceChannel: z.enum(["instagram_comment", "facebook_comment"]),
  caption: z.string().trim().max(8000).nullable(),
  permalink: z.string().trim().url().nullable(),
  mediaType: z.string().trim().max(80).nullable(),
  mediaUrl: z.string().trim().url().nullable().default(null),
  visualDescription: z.string().trim().max(2000).nullable().default(null),
  ctaLabel: z.string().trim().max(120).nullable(),
  areasMentioned: z.array(z.string().trim().min(1).max(120)).max(20),
  listingHints: z.array(z.string().trim().min(1).max(240)).max(30),
  fetchedAt: IsoDateTimeSchema,
  rawPayload: z.unknown(),
});

export const AiReplyDraftSchema = z.object({
  intent: z.enum([
    "listing_question",
    "showing_request",
    "buyer_qualification",
    "seller_qualification",
    "blueprint_request",
    "financing_question",
    "general_follow_up",
    "handoff_needed",
    "spam_or_unsafe",
  ]),
  nextAction: z.enum([
    "reply_only",
    "ask_qualification",
    "send_buyer_blueprint",
    "offer_showing",
    "handoff_to_agent",
    "do_not_reply",
  ]),
  missingFields: z.array(z.enum([
    "name",
    "phone",
    "email",
    "timeline",
    "budget",
    "area",
    "financing",
    "buyer_or_seller",
  ])).max(8),
  confidence: z.number().min(0).max(1),
  policyFlags: z.array(z.enum([
    "claims_listing_availability",
    "claims_financing_certainty",
    "needs_human_review",
    "safe_to_send",
  ])).max(8),
  reply: z.string().trim().min(1).max(500),
});

export type SocialPostContext = z.infer<typeof SocialPostContextSchema>;
export type AiReplyDraft = z.infer<typeof AiReplyDraftSchema>;
