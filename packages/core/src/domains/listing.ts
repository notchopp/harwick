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

export const PublicListingChatQualificationSchema = z.object({
  name: z.string().trim().min(1).max(160).nullable().optional(),
  phone: z.string().trim().min(1).max(80).nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  timeline: z.string().trim().min(1).max(120).nullable().optional(),
  budget: z.union([z.string(), z.number()]).pipe(z.coerce.string().trim().min(1).max(120)).nullable().optional(),
  targetArea: z.string().trim().min(1).max(180).nullable().optional(),
  propertyType: z.string().trim().min(1).max(120).nullable().optional(),
  financingStatus: FinancingStatusSchema.optional(),
  leadType: LeadTypeSchema.optional(),
  intent: LeadIntentSchema.optional(),
  score: z.number().int().min(0).max(100).optional(),
});

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
export type PublicListingChatQualification = z.infer<typeof PublicListingChatQualificationSchema>;
export type PublicListingChatRequest = z.infer<typeof PublicListingChatRequestSchema>;
export type PublicListingChatResponse = z.infer<typeof PublicListingChatResponseSchema>;
export type ListingUrlImportRequest = z.infer<typeof ListingUrlImportRequestSchema>;
export type ListingUrlImportDraft = z.infer<typeof ListingUrlImportDraftSchema>;
export type OpenHouseAttendee = z.infer<typeof OpenHouseAttendeeSchema>;
export type OpenHouseAttendeesResponse = z.infer<typeof OpenHouseAttendeesResponseSchema>;
export type OpenHouseReminderProductionReport = z.infer<typeof OpenHouseReminderProductionReportSchema>;
