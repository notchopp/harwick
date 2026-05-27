import { z } from "zod";
import { UuidSchema } from "./common.js";
import {
  HarwickAiMissingFieldRuntimeSchema,
  HarwickAiRuntimeActionSchema,
  HarwickAiRuntimeSafetyFlagSchema,
  HarwickAiStatePatchSchema,
  HarwickAiToolCallSchema,
} from "./harwick-ai-runtime.js";
import {
  FinancingStatusSchema,
  LeadIntentSchema,
  LeadTypeSchema,
} from "./lead.js";

export const ListingFactSourceSchema = z.enum(["manual", "idx", "repliers", "mls_grid", "fub", "website"]);
export const ListingVerificationStatusSchema = z.enum(["unverified", "verified", "needs_recheck"]);

const NullableTrimmedStringSchema = z.string().trim().min(1).nullable().default(null);
const NullableNonNegativeNumberSchema = z.number().nonnegative().nullable().default(null);

export const ListingFactSchema = z.object({
  source: ListingFactSourceSchema,
  externalListingId: NullableTrimmedStringSchema,
  mlsNumber: NullableTrimmedStringSchema,
  address: z.string().trim().min(1),
  status: NullableTrimmedStringSchema,
  price: z.number().int().nonnegative().nullable().default(null),
  beds: NullableNonNegativeNumberSchema,
  baths: NullableNonNegativeNumberSchema,
  hasPool: z.boolean().nullable().default(null),
  rawFacts: z.record(z.string(), z.unknown()),
  verifiedAt: z.string().datetime({ offset: true }),
});

export const ListingProviderLookupInputSchema = z.object({
  query: z.string().trim().min(1).max(240),
  mlsNumber: z.string().trim().min(1).max(120).nullable().optional(),
  address: z.string().trim().min(1).max(240).nullable().optional(),
});

export const RepliersCredentialSchema = z.object({
  apiKey: z.string().trim().min(1),
  boardId: z.number().int().positive().nullable().optional(),
});

export const ConnectRepliersIntegrationRequestSchema = z.object({
  apiKey: z.string().trim().min(1),
  boardId: z.number().int().positive().nullable().optional(),
  providerAccountName: z.string().trim().min(1).max(160).nullable().optional(),
});

export const ManualListingFactRequestSchema = z.object({
  externalListingId: z.string().trim().min(1).max(160).nullable().optional(),
  mlsNumber: z.string().trim().min(1).max(120).nullable().optional(),
  address: z.string().trim().min(1).max(240),
  neighborhood: z.string().trim().min(1).max(160).nullable().optional(),
  city: z.string().trim().min(1).max(120).nullable().optional(),
  state: z.string().trim().min(1).max(80).nullable().optional(),
  postalCode: z.string().trim().min(1).max(20).nullable().optional(),
  propertyType: z.string().trim().min(1).max(120).nullable().optional(),
  status: z.string().trim().min(1).max(120).nullable().optional(),
  price: z.number().int().nonnegative().nullable().optional(),
  beds: z.number().nonnegative().nullable().optional(),
  baths: z.number().nonnegative().nullable().optional(),
  fullBathrooms: z.number().int().nonnegative().nullable().optional(),
  halfBathrooms: z.number().int().nonnegative().nullable().optional(),
  squareFeet: z.number().nonnegative().nullable().optional(),
  lotSizeSqft: z.number().int().nonnegative().nullable().optional(),
  yearBuilt: z.number().int().min(1600).max(2100).nullable().optional(),
  monthlyHoa: z.number().nonnegative().nullable().optional(),
  parkingSpaces: z.number().int().nonnegative().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  hasPool: z.boolean().nullable().optional(),
  photoUrl: z.string().trim().url().nullable().optional(),
  videoUrl: z.string().trim().url().nullable().optional(),
  mediaUrls: z.array(z.string().trim().url()).max(40).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  publicUrl: z.string().trim().url().nullable().optional(),
  incentives: z.array(z.string().trim().min(1).max(160)).max(12).optional(),
  amenities: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  listingAgentName: z.string().trim().min(1).max(160).nullable().optional(),
  listingBrokerage: z.string().trim().min(1).max(160).nullable().optional(),
  daysOnMarket: z.number().int().nonnegative().nullable().optional(),
});

export const ManualListingQuickUpdateRequestSchema = z.object({
  externalListingId: z.string().trim().min(1).max(160).nullable().optional(),
  mlsNumber: z.string().trim().min(1).max(120).nullable().optional(),
  address: z.string().trim().min(1).max(240).optional(),
  neighborhood: z.string().trim().min(1).max(160).nullable().optional(),
  propertyType: z.string().trim().min(1).max(120).nullable().optional(),
  status: z.string().trim().min(1).max(120).nullable().optional(),
  price: z.number().int().nonnegative().nullable().optional(),
  beds: z.number().nonnegative().nullable().optional(),
  baths: z.number().nonnegative().nullable().optional(),
  squareFeet: z.number().nonnegative().nullable().optional(),
  hasPool: z.boolean().nullable().optional(),
  photoUrl: z.string().trim().url().nullable().optional(),
  videoUrl: z.string().trim().url().nullable().optional(),
  mediaUrls: z.array(z.string().trim().url()).max(24).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  publicUrl: z.string().trim().url().nullable().optional(),
  incentives: z.array(z.string().trim().min(1).max(160)).max(12).optional(),
  verificationStatus: ListingVerificationStatusSchema.optional(),
  needsRecheckAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one listing update field is required.",
});

export const ManualListingVerifyRequestSchema = z.object({
  notes: z.string().trim().max(2000).nullable().optional(),
  needsRecheckAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export const ManualListingCsvImportRequestSchema = z.object({
  csv: z.string().trim().min(1),
});

export const PublicListingInquiryRequestSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(10).max(20),
  intent: z.enum(["general", "question", "showing", "open_house"]).default("general"),
  message: z.string().trim().min(1).max(2000).nullable().optional(),
  propertyType: z.string().trim().min(1).max(120).nullable().optional(),
  budget: z.number().int().nonnegative().nullable().optional(),
  timeline: z.string().trim().max(120).nullable().optional(),
  requestedStartAt: z.string().datetime().nullable().optional(),
  requestedEndAt: z.string().datetime().nullable().optional(),
}).superRefine((value, context) => {
  if (value.requestedStartAt === null || value.requestedStartAt === undefined) {
    return;
  }
  if (value.requestedEndAt === null || value.requestedEndAt === undefined) {
    return;
  }
  if (Date.parse(value.requestedEndAt) <= Date.parse(value.requestedStartAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "requestedEndAt must be after requestedStartAt",
      path: ["requestedEndAt"],
    });
  }
});

export const PublicListingChatMessageSchema = z.object({
  id: z.string().trim().min(1).max(160),
  actor: z.enum(["lead", "harwick_ai"]),
  body: z.string().trim().min(1).max(2000),
  occurredAt: z.string().datetime().nullable().default(null),
});

/**
 * Funnel a public visitor falls into. Detected from conversation signal:
 * "is this available" / "can I see" → buyer; "my house in X" / "what's
 * mine worth" → seller; "cap rate" / "1031" → investor; "lease" / "rent"
 * → renter; very short noncommittal → browser. Unknown until detected.
 * The same session row carries the funnel; once promoted to a lead, the
 * lead inherits it for routing.
 */
export const PublicListingChatFunnelSchema = z.enum([
  "buyer",
  "seller",
  "investor",
  "renter",
  "browser",
  "unknown",
]);

export const PublicListingChatQualificationSchema = z.object({
  // Public-listing sessions need a lightweight living document before the
  // visitor is promoted to a full lead. These fields feed returning-visitor
  // context and keep Harwick from forgetting natural signals like kids,
  // schools, payment comfort, or life-change timing between turns.
  currentIntent: z.string().trim().min(1).max(160).nullable().optional(),
  knownFacts: z.array(z.string().trim().min(1).max(240)).max(40).optional(),
  // Funnel routing — detected in first 1-2 turns. Drives which path the
  // system prompt steers Harwick down (buyer LPMAMA / seller listing-
  // appointment arc / investor yield arc / renter polite handoff / browser
  // light touch).
  funnelType: PublicListingChatFunnelSchema.optional(),
  // Visitor identity. `name` populates the "RETURNING VISITOR" recognition
  // block on the next session so Harwick greets by name.
  name: z.string().trim().min(1).max(160).nullable().optional(),
  phone: z.string().trim().min(1).max(80).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  // Buyer-side qualification — LPMAMA fields plus post-2026-settlement
  // additions (hasBuyerRep, preApprovalStatus).
  timeline: z.string().trim().min(1).max(120).nullable().optional(),
  budget: z.union([z.string(), z.number()]).pipe(z.coerce.string().trim().min(1).max(120)).nullable().optional(),
  targetArea: z.string().trim().min(1).max(180).nullable().optional(),
  propertyType: z.string().trim().min(1).max(120).nullable().optional(),
  financingStatus: FinancingStatusSchema.optional(),
  leadType: LeadTypeSchema.optional(),
  intent: LeadIntentSchema.optional(),
  score: z.number().int().min(0).max(100).optional(),
  // Post-NAR-settlement reality: buyer rep agreement + pre-approval are
  // the gates to a showing. Capturing them lets Harwick offer real
  // showing windows ("you've got a BRA + pre-approval, so I can lock in
  // Sat 11am with Mike") vs. a soft confirm-with-agent loop.
  hasBuyerRep: z.boolean().nullable().optional(),
  preApprovalStatus: z.enum(["preapproved", "pending", "none", "unknown"]).optional(),
  // Memory-document fields. These are what make the buyer-portal drawer
  // feel like Harwick is actually paying attention rather than filling
  // out a CRM form. Each is APPENDED across turns (deduped), never
  // overwritten.
  //   - lifeContext: kids/marriage/job/family timing notes ("3 kids
  //     entering middle school", "getting married June 2026", "company
  //     relocating to Austin Sept 1"). Atomic sentences.
  //   - preferredShowingTimes: speculative time windows the buyer hints
  //     at even pre-booking ("Saturday mornings", "evenings only").
  //   - vibeNotes: emotional / style observations ("urgent — needs to
  //     move before lease ends", "analytical, asks lots of payment
  //     questions", "anxious about timing").
  //   - headline: model-generated one-line summary of the visitor —
  //     overwritten (not appended) on every material change. Renders as
  //     the hero line at the top of the buyer-portal drawer.
  lifeContext: z.array(z.string().trim().min(1).max(280)).max(12).optional(),
  preferredShowingTimes: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  vibeNotes: z.array(z.string().trim().min(1).max(240)).max(8).optional(),
  headline: z.string().trim().min(1).max(280).nullable().optional(),
  // Seller-side fields. Live alongside buyer fields on the same session —
  // most won't have both, but conjoint cases (selling current home to buy
  // next) are normal and we want one session row not two.
  sellerPropertyAddress: z.string().trim().min(1).max(220).nullable().optional(),
  sellerMotivation: z.string().trim().min(1).max(240).nullable().optional(),
  sellerTimeline: z.string().trim().min(1).max(120).nullable().optional(),
  sellerCondition: z.string().trim().min(1).max(600).nullable().optional(),
  sellerPriceExpectation: z.string().trim().min(1).max(120).nullable().optional(),
});

/**
 * Pre-enriched area intelligence for a listing. Written by the
 * enrichment background job (Mapbox geocode + Overpass POIs + Census
 * demographics + Brave Search for school ratings) and read by the chat
 * generator at zero per-message cost. Cached on listing_facts.raw_facts
 * .area_intel so no schema migration is needed.
 */
export const ListingAreaIntelSchema = z.object({
  coordinates: z.object({
    lat: z.number(),
    lng: z.number(),
  }).nullable(),
  schools: z.array(z.object({
    name: z.string(),
    level: z.enum(["elementary", "middle", "high", "unknown"]),
    rating: z.number().min(0).max(10).nullable(),
    ratingSource: z.string().nullable(),
    distanceMiles: z.number().nullable(),
  })).max(20).default([]),
  nearbyPOIs: z.object({
    groceries: z.array(z.string()).max(10).default([]),
    restaurants: z.array(z.string()).max(10).default([]),
    parks: z.array(z.string()).max(10).default([]),
    gyms: z.array(z.string()).max(10).default([]),
    healthcare: z.array(z.string()).max(10).default([]),
    shopping: z.array(z.string()).max(10).default([]),
  }).default({}),
  demographics: z.object({
    medianHouseholdIncome: z.number().nullable(),
    medianAge: z.number().nullable(),
    populationDensity: z.number().nullable(),
  }).nullable(),
  walkability: z.object({
    score: z.number().min(0).max(100).nullable(),
    label: z.string().nullable(),
    source: z.string().nullable(),
  }).nullable(),
  lastEnrichedAt: z.string().datetime().nullable(),
});

const MortgageMoneySchema = z.number().finite().nonnegative();

export const MortgagePaymentEstimateInputSchema = z
  .object({
    price: MortgageMoneySchema,
    downPayment: MortgageMoneySchema.optional(),
    downPaymentPercent: z.number().finite().min(0).max(100).default(20),
    annualInterestRatePercent: z.number().finite().min(0).max(30).default(6.75),
    termYears: z.number().int().positive().max(50).default(30),
    annualTaxRatePercent: z.number().finite().min(0).max(10).default(1.1),
    monthlyInsurance: MortgageMoneySchema.default(0),
    monthlyHoa: MortgageMoneySchema.default(0),
    includeEstimatedPmi: z.boolean().default(true),
    annualPmiRatePercent: z.number().finite().min(0).max(5).default(0.5),
    monthlyPmi: MortgageMoneySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.downPayment !== undefined && value.downPayment > value.price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "downPayment must not exceed price",
        path: ["downPayment"],
      });
    }
  });

export const MortgagePaymentEstimateSchema = z.object({
  price: z.number().nonnegative(),
  downPayment: z.number().nonnegative(),
  downPaymentPercent: z.number().min(0).max(100),
  loanAmount: z.number().nonnegative(),
  annualInterestRatePercent: z.number().min(0).max(30),
  termYears: z.number().int().positive(),
  monthlyPrincipalAndInterest: z.number().nonnegative(),
  monthlyTaxes: z.number().nonnegative(),
  monthlyInsurance: z.number().nonnegative(),
  monthlyHoa: z.number().nonnegative(),
  monthlyPmi: z.number().nonnegative(),
  monthlyTotal: z.number().nonnegative(),
  assumptions: z.array(z.string().trim().min(1)).default([]),
  warnings: z.array(z.string().trim().min(1)).default([]),
  disclaimer: z.string().trim().min(1),
});

function roundMonthlyCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function calculateMonthlyPrincipalAndInterest(input: {
  loanAmount: number;
  annualInterestRatePercent: number;
  termYears: number;
}): number {
  const paymentCount = input.termYears * 12;
  if (input.loanAmount <= 0 || paymentCount <= 0) {
    return 0;
  }

  const monthlyRate = input.annualInterestRatePercent / 100 / 12;
  if (monthlyRate === 0) {
    return roundMonthlyCurrency(input.loanAmount / paymentCount);
  }

  const factor = (1 + monthlyRate) ** paymentCount;
  return roundMonthlyCurrency(input.loanAmount * ((monthlyRate * factor) / (factor - 1)));
}

export function calculateMortgagePaymentEstimate(input: MortgagePaymentEstimateInput): MortgagePaymentEstimate {
  const parsed = MortgagePaymentEstimateInputSchema.parse(input);
  const downPayment = roundMonthlyCurrency(
    parsed.downPayment ?? parsed.price * (parsed.downPaymentPercent / 100),
  );
  const downPaymentPercent = parsed.price === 0 ? 0 : Number(((downPayment / parsed.price) * 100).toFixed(2));
  const loanAmount = roundMonthlyCurrency(parsed.price - downPayment);
  const monthlyPrincipalAndInterest = calculateMonthlyPrincipalAndInterest({
    loanAmount,
    annualInterestRatePercent: parsed.annualInterestRatePercent,
    termYears: parsed.termYears,
  });
  const monthlyTaxes = roundMonthlyCurrency(parsed.price * (parsed.annualTaxRatePercent / 100) / 12);
  const monthlyInsurance = roundMonthlyCurrency(parsed.monthlyInsurance);
  const monthlyHoa = roundMonthlyCurrency(parsed.monthlyHoa);
  const monthlyPmi = roundMonthlyCurrency(
    parsed.monthlyPmi
      ?? (parsed.includeEstimatedPmi && downPaymentPercent < 20
        ? loanAmount * (parsed.annualPmiRatePercent / 100) / 12
        : 0),
  );
  const warnings = [
    ...(parsed.monthlyPmi === undefined && parsed.includeEstimatedPmi && downPaymentPercent < 20
      ? [`PMI is estimated at ${parsed.annualPmiRatePercent}% annually because down payment is below 20%.`]
      : []),
    ...(parsed.monthlyInsurance === 0 ? ["Homeowners insurance is not included unless entered."] : []),
  ];

  return MortgagePaymentEstimateSchema.parse({
    price: roundMonthlyCurrency(parsed.price),
    downPayment,
    downPaymentPercent,
    loanAmount,
    annualInterestRatePercent: parsed.annualInterestRatePercent,
    termYears: parsed.termYears,
    monthlyPrincipalAndInterest,
    monthlyTaxes,
    monthlyInsurance,
    monthlyHoa,
    monthlyPmi,
    monthlyTotal: monthlyPrincipalAndInterest + monthlyTaxes + monthlyInsurance + monthlyHoa + monthlyPmi,
    assumptions: [
      `${downPaymentPercent}% down`,
      `${parsed.annualInterestRatePercent}% rate`,
      `${parsed.termYears}-year term`,
      `${parsed.annualTaxRatePercent}% annual property tax`,
    ],
    warnings,
    disclaimer: "Estimate only. Not a loan offer, approval, or quote; taxes, insurance, HOA, PMI, and lender terms can change.",
  });
}

export const PublicListingChatRequestSchema = z.object({
  listingId: UuidSchema,
  message: z.string().trim().min(1).max(2000),
  conversation: z.array(PublicListingChatMessageSchema).max(20).default([]),
  qualification: PublicListingChatQualificationSchema.default({}),
});

export const PublicListingChatResponseSchema = z.object({
  reply: z.string().trim().min(1).max(800),
  nextAction: HarwickAiRuntimeActionSchema,
  missingFields: z.array(HarwickAiMissingFieldRuntimeSchema).max(10),
  statePatch: HarwickAiStatePatchSchema,
  handoffBrief: z.string().trim().max(1000).nullable(),
  safetyFlags: z.array(HarwickAiRuntimeSafetyFlagSchema).max(10),
  confidence: z.number().min(0).max(1),
  toolCalls: z.array(HarwickAiToolCallSchema).max(8),
  documentUpdate: z.string().trim().max(2000),
  leadCapture: z.object({
    leadId: UuidSchema,
    status: z.enum(["created", "updated"]),
    intent: z.enum(["question", "showing"]),
    showingTaskId: UuidSchema.nullable(),
  }).nullable().default(null),
});

export const PublicListingPortalAgentSchema = z.object({
  memberId: UuidSchema,
  displayName: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(60),
  email: z.string().trim().email().nullable(),
  phone: z.string().trim().min(1).max(40).nullable(),
  specialties: z.string().trim().min(1).max(400).nullable(),
  avatarUrl: z.string().trim().url().max(2048).nullable(),
});

export const PublicListingPortalShowingSchema = z.object({
  taskId: UuidSchema,
  listingId: UuidSchema,
  listingAddress: z.string().trim().min(1).max(280),
  requestedStartAt: z.string().datetime({ offset: true }).nullable(),
  requestedEndAt: z.string().datetime({ offset: true }).nullable(),
  status: z.enum(["pending", "approved", "declined", "completed", "cancelled"]),
  assignedAgent: PublicListingPortalAgentSchema.nullable(),
});

export const PublicListingPortalTurnSchema = z.object({
  actor: z.enum(["visitor", "harwick_ai"]),
  body: z.string().trim().min(1).max(4000),
  occurredAt: z.string().datetime({ offset: true }),
});

export const PublicListingPortalProfileSchema = z.object({
  isReturning: z.boolean(),
  name: z.string().trim().min(1).max(160).nullable(),
  phone: z.string().trim().min(1).max(40).nullable(),
  email: z.string().trim().email().nullable(),
  lastSeenAt: z.string().datetime({ offset: true }).nullable(),
  // Model-generated one-line summary ("Serious buyer, Coral Gables under
  // $2.5M, before fall"). Rendered as the drawer hero.
  headline: z.string().trim().min(1).max(280).nullable(),
  // Atomic facts Harwick has captured (mostly via note_qualification's
  // `learned` field auto-appended). Displayed as bullets under hero.
  knownFacts: z.array(z.string().trim().min(1).max(280)).max(20),
  // Life-event notes (kids/marriage/job/family/health timing) — the
  // human story behind the search. Separated from knownFacts so the
  // drawer can render them as their own section with prominence.
  lifeContext: z.array(z.string().trim().min(1).max(280)).max(12),
  preferredShowingTimes: z.array(z.string().trim().min(1).max(120)).max(8),
  vibeNotes: z.array(z.string().trim().min(1).max(240)).max(8),
  listingsAskedAbout: z.array(z.object({
    id: UuidSchema,
    address: z.string().trim().min(1).max(280),
    firstAskedAt: z.string().datetime({ offset: true }).nullable(),
    lastAskedAt: z.string().datetime({ offset: true }).nullable(),
  })).max(10),
});

export const PublicListingPortalTeamMemberSchema = z.object({
  memberId: UuidSchema,
  displayName: z.string().trim().min(1).max(160),
  role: z.string().trim().min(1).max(60),
  specialties: z.string().trim().min(1).max(400).nullable(),
  avatarUrl: z.string().trim().url().max(2048).nullable(),
});

/**
 * Buyer-portal GET shape. Returned by GET /[slug]/api/listings/chat — the
 * dynamic page state for a returning visitor: their thread scrollback, the
 * brokerage team (always), the agent assigned to *this* visitor if any,
 * and showings they have on this listing. Cookie-scoped (session_token).
 */
export const PublicListingPortalStateSchema = z.object({
  priorTurns: z.array(PublicListingPortalTurnSchema).max(40),
  profile: PublicListingPortalProfileSchema,
  team: z.array(PublicListingPortalTeamMemberSchema).max(8),
  assignedAgent: PublicListingPortalAgentSchema.nullable(),
  showings: z.array(PublicListingPortalShowingSchema).max(10),
});

export const ListingMemoryKindSchema = z.enum([
  "common_question",
  "common_objection",
  "context_note",
  "incentive",
  "sales_angle",
]);

export const ListingMemoryVisibilitySchema = z.enum(["public", "internal"]);

export const ListingMemorySourceSchema = z.enum(["operator", "harwick_inferred", "system_seed"]);

export const ListingMemorySchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  listingId: UuidSchema,
  kind: ListingMemoryKindSchema,
  visibility: ListingMemoryVisibilitySchema,
  // The visitor-facing chip text. Only required when visibility === "public";
  // internal notes leave this null and put the full payload in content.
  prompt: z.string().trim().min(1).max(120).nullable(),
  content: z.string().trim().min(1).max(2000),
  source: ListingMemorySourceSchema,
  displayOrder: z.number().int().min(0).max(10_000),
  createdByMemberId: UuidSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ListingMemoryUpsertRequestSchema = z
  .object({
    listingId: UuidSchema,
    kind: ListingMemoryKindSchema,
    visibility: ListingMemoryVisibilitySchema.default("internal"),
    prompt: z.string().trim().min(1).max(120).nullable().default(null),
    content: z.string().trim().min(1).max(2000),
    displayOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.visibility === "public" && value.prompt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prompt"],
        message: "prompt is required when visibility is public",
      });
    }
  });

export const ListingUrlImportRequestSchema = z.object({
  url: z.string().trim().url().max(2048),
});

export const ListingUrlImportDraftSchema = z.object({
  source: z.enum(["json_ld", "open_graph", "vision_fallback"]),
  sourceUrl: z.string().trim().url().max(2048),
  fetchedAt: z.string().datetime({ offset: true }),
  draft: ManualListingFactRequestSchema,
  warnings: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
});

export const OpenHouseAttendeeSchema = z.object({
  taskId: UuidSchema,
  workspaceId: UuidSchema,
  listingId: UuidSchema,
  leadId: UuidSchema.nullable(),
  status: z.string().trim().min(1).max(80),
  attendeeName: z.string().trim().min(1).max(160).nullable(),
  attendeeEmail: z.string().trim().email().nullable(),
  attendeePhone: z.string().trim().min(1).max(40).nullable(),
  requestedArrivalAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
});

export const OpenHouseAttendeesResponseSchema = z.object({
  attendees: z.array(OpenHouseAttendeeSchema),
});

export const OpenHouseReminderProductionReportSchema = z.object({
  scanned: z.number().int().min(0),
  remindersDrafted: z.number().int().min(0),
  remindersAlreadyPresent: z.number().int().min(0),
  remindersBlocked: z.number().int().min(0),
  skipped: z.number().int().min(0),
  errors: z.number().int().min(0),
});

export type ListingFact = z.infer<typeof ListingFactSchema>;
export type ListingFactSource = z.infer<typeof ListingFactSourceSchema>;
export type ListingVerificationStatus = z.infer<typeof ListingVerificationStatusSchema>;
export type ListingProviderLookupInput = z.infer<typeof ListingProviderLookupInputSchema>;
export type RepliersCredential = z.infer<typeof RepliersCredentialSchema>;
export type ConnectRepliersIntegrationRequest = z.infer<typeof ConnectRepliersIntegrationRequestSchema>;
export type ManualListingFactRequest = z.infer<typeof ManualListingFactRequestSchema>;
export type ManualListingQuickUpdateRequest = z.infer<typeof ManualListingQuickUpdateRequestSchema>;
export type ManualListingVerifyRequest = z.infer<typeof ManualListingVerifyRequestSchema>;
export type ManualListingCsvImportRequest = z.infer<typeof ManualListingCsvImportRequestSchema>;
export type PublicListingInquiryRequest = z.infer<typeof PublicListingInquiryRequestSchema>;
export type PublicListingChatMessage = z.infer<typeof PublicListingChatMessageSchema>;
export type PublicListingChatFunnel = z.infer<typeof PublicListingChatFunnelSchema>;
export type PublicListingChatQualification = z.infer<typeof PublicListingChatQualificationSchema>;
export type PublicListingPortalAgent = z.infer<typeof PublicListingPortalAgentSchema>;
export type PublicListingPortalShowing = z.infer<typeof PublicListingPortalShowingSchema>;
export type PublicListingPortalTurn = z.infer<typeof PublicListingPortalTurnSchema>;
export type PublicListingPortalProfile = z.infer<typeof PublicListingPortalProfileSchema>;
export type PublicListingPortalTeamMember = z.infer<typeof PublicListingPortalTeamMemberSchema>;
export type PublicListingPortalState = z.infer<typeof PublicListingPortalStateSchema>;
export type ListingAreaIntel = z.infer<typeof ListingAreaIntelSchema>;
export type MortgagePaymentEstimateInput = z.input<typeof MortgagePaymentEstimateInputSchema>;
export type MortgagePaymentEstimate = z.infer<typeof MortgagePaymentEstimateSchema>;
export type PublicListingChatRequest = z.infer<typeof PublicListingChatRequestSchema>;
export type PublicListingChatResponse = z.infer<typeof PublicListingChatResponseSchema>;
export type ListingMemoryKind = z.infer<typeof ListingMemoryKindSchema>;
export type ListingMemoryVisibility = z.infer<typeof ListingMemoryVisibilitySchema>;
export type ListingMemorySource = z.infer<typeof ListingMemorySourceSchema>;
export type ListingMemory = z.infer<typeof ListingMemorySchema>;
export type ListingMemoryUpsertRequest = z.infer<typeof ListingMemoryUpsertRequestSchema>;
export type ListingUrlImportRequest = z.infer<typeof ListingUrlImportRequestSchema>;
export type ListingUrlImportDraft = z.infer<typeof ListingUrlImportDraftSchema>;
export type OpenHouseAttendee = z.infer<typeof OpenHouseAttendeeSchema>;
export type OpenHouseAttendeesResponse = z.infer<typeof OpenHouseAttendeesResponseSchema>;
export type OpenHouseReminderProductionReport = z.infer<typeof OpenHouseReminderProductionReportSchema>;
