import { z } from "zod";

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
  message: z.string().trim().min(1).max(2000).nullable().optional(),
  propertyType: z.string().trim().min(1).max(120).nullable().optional(),
  budget: z.number().int().nonnegative().nullable().optional(),
  timeline: z.string().trim().max(120).nullable().optional(),
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
