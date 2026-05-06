import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";

export const CalendarProviderSchema = z.enum(["google"]);

export const CalendarConnectionStatusSchema = z.enum(["connected", "error", "revoked"]);

export const ShowingModeSchema = z.enum(["collect_only", "request_approve", "auto_book"]);

export const WorkspaceMemberCalendarConnectionSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  memberId: UuidSchema,
  provider: CalendarProviderSchema,
  providerAccountEmail: z.string().trim().email().nullable(),
  calendarId: z.string().trim().min(1).max(300),
  status: CalendarConnectionStatusSchema,
  showingMode: ShowingModeSchema,
  timezone: z.string().trim().min(1).max(80),
  lastSyncedAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const CalendarAvailabilityWindowSchema = z.object({
  start: IsoDateTimeSchema,
  end: IsoDateTimeSchema,
  label: z.string().trim().min(1).max(120),
});

export const CalendarAvailabilityResultSchema = z.object({
  memberId: UuidSchema,
  provider: CalendarProviderSchema,
  calendarId: z.string().trim().min(1).max(300),
  timezone: z.string().trim().min(1).max(80),
  showingMode: ShowingModeSchema,
  availableWindows: z.array(CalendarAvailabilityWindowSchema).max(20),
  busyWindows: z.array(z.object({
    start: IsoDateTimeSchema,
    end: IsoDateTimeSchema,
  })).max(100),
  synthesized: z.boolean(),
});

export const StartGoogleCalendarOAuthRequestSchema = z.object({
  memberId: UuidSchema.optional(),
});

export const GoogleCalendarCredentialSchema = z.object({
  version: z.literal("google_calendar_oauth_v1"),
  accessToken: z.string().trim().min(1),
  refreshToken: z.string().trim().min(1).nullable(),
  tokenType: z.string().trim().min(1),
  scope: z.string().trim().min(1).nullable(),
  expiresAt: IsoDateTimeSchema.nullable(),
});

export const ShowingApprovalActionRequestSchema = z.union([
  z.object({
    action: z.literal("approve_and_book"),
    start: IsoDateTimeSchema,
    end: IsoDateTimeSchema,
    title: z.string().trim().min(1).max(180).optional(),
    location: z.string().trim().min(1).max(300).optional(),
    attendeeEmail: z.string().trim().email().optional(),
    attendeeName: z.string().trim().min(1).max(160).optional(),
    note: z.string().trim().max(1000).optional(),
  }).refine((value) => Date.parse(value.end) > Date.parse(value.start), {
    message: "end must be after start",
    path: ["end"],
  }),
  z.object({
    action: z.literal("dismiss"),
    reason: z.string().trim().min(1).max(500),
  }),
]);

export const ShowingApprovalActionResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("booked"),
    taskId: UuidSchema,
    leadId: UuidSchema,
    memberId: UuidSchema,
    provider: CalendarProviderSchema,
    calendarId: z.string().trim().min(1).max(300),
    calendarEventId: z.string().trim().min(1).max(300),
    start: IsoDateTimeSchema,
    end: IsoDateTimeSchema,
  }),
  z.object({
    status: z.literal("dismissed"),
    taskId: UuidSchema,
    reason: z.string().trim().min(1).max(500),
  }),
]);

export type CalendarProvider = z.infer<typeof CalendarProviderSchema>;
export type CalendarConnectionStatus = z.infer<typeof CalendarConnectionStatusSchema>;
export type ShowingMode = z.infer<typeof ShowingModeSchema>;
export type WorkspaceMemberCalendarConnection = z.infer<typeof WorkspaceMemberCalendarConnectionSchema>;
export type CalendarAvailabilityWindow = z.infer<typeof CalendarAvailabilityWindowSchema>;
export type CalendarAvailabilityResult = z.infer<typeof CalendarAvailabilityResultSchema>;
export type StartGoogleCalendarOAuthRequest = z.infer<typeof StartGoogleCalendarOAuthRequestSchema>;
export type GoogleCalendarCredential = z.infer<typeof GoogleCalendarCredentialSchema>;
export type ShowingApprovalActionRequest = z.infer<typeof ShowingApprovalActionRequestSchema>;
export type ShowingApprovalActionResult = z.infer<typeof ShowingApprovalActionResultSchema>;
