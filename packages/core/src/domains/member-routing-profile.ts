import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";
import { LeadTypeSchema } from "./lead.js";
import { RoutingPropertyTypeSchema } from "./lead-routing.js";

export const MemberRoutingProfileNotificationPreferenceSchema = z.enum(["sms", "email", "app"]);

export const MemberRoutingProfileCreateRequestSchema = z.object({
  memberId: UuidSchema,
  roleLabel: z.string().trim().min(1).max(80),
  areas: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  propertyTypes: z.array(RoutingPropertyTypeSchema).min(1).max(10),
  leadTypes: z.array(LeadTypeSchema.exclude(["unknown"])).min(1).max(4),
  budgetMin: z.number().int().nonnegative().nullable().default(null),
  budgetMax: z.number().int().nonnegative().nullable().default(null),
  maxActiveLeads: z.number().int().positive().min(1).max(100).default(10),
  acceptsNewLeads: z.boolean().default(true),
  notificationPreference: MemberRoutingProfileNotificationPreferenceSchema.default("app"),
});

export const MemberRoutingProfileUpdateRequestSchema = z.object({
  roleLabel: z.string().trim().min(1).max(80).optional(),
  areas: z.array(z.string().trim().min(1).max(120)).min(1).max(20).optional(),
  propertyTypes: z.array(RoutingPropertyTypeSchema).min(1).max(10).optional(),
  leadTypes: z.array(LeadTypeSchema.exclude(["unknown"])).min(1).max(4).optional(),
  budgetMin: z.number().int().nonnegative().nullable().optional(),
  budgetMax: z.number().int().nonnegative().nullable().optional(),
  maxActiveLeads: z.number().int().positive().min(1).max(100).optional(),
  acceptsNewLeads: z.boolean().optional(),
  notificationPreference: MemberRoutingProfileNotificationPreferenceSchema.optional(),
});

export const MemberRoutingProfileResponseSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  memberId: UuidSchema,
  memberDisplayName: z.string().trim().min(1),
  roleLabel: z.string().trim().min(1).max(80),
  areas: z.array(z.string().trim().min(1).max(120)),
  propertyTypes: z.array(RoutingPropertyTypeSchema),
  leadTypes: z.array(LeadTypeSchema.exclude(["unknown"])),
  budgetMin: z.number().int().nonnegative().nullable(),
  budgetMax: z.number().int().nonnegative().nullable(),
  maxActiveLeads: z.number().int().positive(),
  acceptsNewLeads: z.boolean(),
  notificationPreference: MemberRoutingProfileNotificationPreferenceSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const MemberRoutingProfileListResponseSchema = z.object({
  profiles: z.array(MemberRoutingProfileResponseSchema),
});

export type MemberRoutingProfileCreateRequest = z.infer<typeof MemberRoutingProfileCreateRequestSchema>;
export type MemberRoutingProfileUpdateRequest = z.infer<typeof MemberRoutingProfileUpdateRequestSchema>;
export type MemberRoutingProfileResponse = z.infer<typeof MemberRoutingProfileResponseSchema>;
export type MemberRoutingProfileListResponse = z.infer<typeof MemberRoutingProfileListResponseSchema>;
