import { z } from "zod";

/**
 * THREADS-2: the 10 typed-card kinds that can be posted to a harwick_channels
 * channel. Each card is a structured payload with a discriminated union by
 * card_kind. The renderer switches on card_kind and renders the right card
 * component. Card content is operator-facing; cards are how Harwick (and
 * agents) surface structured ops moments in chat — referral handoffs, persona
 * shifts, sync conflicts, etc.
 */

export const LeadCaptureCardSchema = z.object({
  kind: z.literal("lead_capture"),
  leadId: z.string().uuid(),
  leadName: z.string(),
  source: z.string(),
  score: z.number().int().min(0).max(100),
  qualificationSummary: z.string().nullable(),
});

export const ShowingRequestCardSchema = z.object({
  kind: z.literal("showing_request"),
  leadId: z.string().uuid(),
  listingId: z.string().uuid().nullable(),
  proposedTime: z.string().datetime().nullable(),
  buyerNote: z.string().nullable(),
});

export const CallbackRequestCardSchema = z.object({
  kind: z.literal("callback_request"),
  leadId: z.string().uuid(),
  scheduledFor: z.string().datetime().nullable(),
  reason: z.string(),
});

export const LenderIntroCardSchema = z.object({
  kind: z.literal("lender_intro"),
  leadId: z.string().uuid(),
  lenderPartnerId: z.string().uuid().nullable(),
  lenderName: z.string().nullable(),
  buyerReadiness: z.string(),
});

export const ListingShareCardSchema = z.object({
  kind: z.literal("listing_share"),
  listingId: z.string().uuid(),
  listingAddress: z.string(),
  listingPrice: z.string(),
  shareLink: z.string().url(),
});

export const ReferralHandoffCardSchema = z.object({
  kind: z.literal("referral_handoff"),
  leadId: z.string().uuid(),
  fromMemberId: z.string().uuid(),
  toMemberId: z.string().uuid().nullable(),
  reason: z.string(),
  status: z.enum(["proposed", "accepted", "declined"]),
});

export const PersonaShiftAlertCardSchema = z.object({
  kind: z.literal("persona_shift_alert"),
  leadId: z.string().uuid(),
  fromPersona: z.string(),
  toPersona: z.string(),
  deltas: z.array(z.string()).max(8),
  reconcileVerdict: z.enum(["merge", "flag_contradiction", "create_separate_lead"]),
});

export const RoutingRecommendationCardSchema = z.object({
  kind: z.literal("routing_recommendation"),
  leadId: z.string().uuid(),
  recommendedMemberId: z.string().uuid(),
  recommendedDisplayName: z.string(),
  rationale: z.string(),
  fallbackMemberIds: z.array(z.string().uuid()).max(3),
});

export const SyncConflictCardSchema = z.object({
  kind: z.literal("sync_conflict"),
  leadId: z.string().uuid(),
  crmProvider: z.enum(["fub", "kvcore", "boomtown", "sierra", "wise_agent", "lion_desk", "real_geeks", "propertybase", "chime"]),
  conflictFields: z.array(z.string()),
  resolution: z.enum(["accept_crm", "accept_harwick", "escalate"]).nullable(),
});

export const BrokerageAnnouncementCardSchema = z.object({
  kind: z.literal("brokerage_announcement"),
  title: z.string().max(120),
  body: z.string().max(2000),
  authorMemberId: z.string().uuid().nullable(),
});

export const HarwickTypedCardSchema = z.discriminatedUnion("kind", [
  LeadCaptureCardSchema,
  ShowingRequestCardSchema,
  CallbackRequestCardSchema,
  LenderIntroCardSchema,
  ListingShareCardSchema,
  ReferralHandoffCardSchema,
  PersonaShiftAlertCardSchema,
  RoutingRecommendationCardSchema,
  SyncConflictCardSchema,
  BrokerageAnnouncementCardSchema,
]);

export type HarwickTypedCard = z.infer<typeof HarwickTypedCardSchema>;
export type HarwickTypedCardKind = HarwickTypedCard["kind"];

/**
 * Convenience: assemble a channel-message payload from a typed card.
 * The body string is the fallback text for non-card-aware renderers.
 */
export function buildTypedCardMessage(card: HarwickTypedCard): {
  card_kind: HarwickTypedCardKind;
  card_payload: HarwickTypedCard;
  body: string;
} {
  const body = describeCard(card);
  return { card_kind: card.kind, card_payload: card, body };
}

function describeCard(card: HarwickTypedCard): string {
  switch (card.kind) {
    case "lead_capture":           return `Captured lead: ${card.leadName} (score ${card.score})`;
    case "showing_request":        return `Showing requested for lead ${card.leadId.slice(0, 8)}`;
    case "callback_request":       return `Callback requested: ${card.reason}`;
    case "lender_intro":           return `Lender intro queued for lead ${card.leadId.slice(0, 8)}`;
    case "listing_share":          return `Shared listing: ${card.listingAddress}`;
    case "referral_handoff":       return `Referral handoff (${card.status})`;
    case "persona_shift_alert":    return `Persona shift on lead — ${card.reconcileVerdict}`;
    case "routing_recommendation": return `Routing recommendation: ${card.recommendedDisplayName}`;
    case "sync_conflict":          return `CRM sync conflict (${card.crmProvider})`;
    case "brokerage_announcement": return `Announcement: ${card.title}`;
  }
}
