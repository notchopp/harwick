import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";

export const NurtureEnrollmentStatusSchema = z.enum(["active", "paused", "completed", "opted_out"]);
export const NurtureMessageChannelSchema = z.enum(["sms", "instagram_dm", "facebook_dm"]);
export const NurtureMessageStatusSchema = z.enum(["queued", "blocked", "drafted", "sent", "failed"]);
export const NurtureBlockReasonSchema = z.enum(["opted_out", "quiet_hours", "missing_contact", "sequence_complete"]);

export const NurtureEnrollmentSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  leadId: UuidSchema,
  status: NurtureEnrollmentStatusSchema,
  sequenceKey: z.string().trim().min(1),
  nextActionAt: IsoDateTimeSchema.nullable(),
  quietHoursTimezone: z.string().trim().min(1),
  lastStepIndex: z.number().int().min(0),
  optedOutAt: IsoDateTimeSchema.nullable(),
  optOutReason: z.string().trim().min(1).nullable(),
});

export const NurtureLeadContactSchema = z.object({
  leadId: UuidSchema,
  workspaceId: UuidSchema,
  fullName: z.string().trim().min(1).nullable(),
  phone: z.string().trim().min(1).nullable(),
  instagramUserId: z.string().trim().min(1).nullable(),
  sourceChannel: z.enum(["instagram_dm", "instagram_comment", "facebook_dm", "facebook_comment", "call", "sms", "manual", "csv_import"]),
});

export const NurtureStepSchema = z.object({
  index: z.number().int().min(0),
  channel: NurtureMessageChannelSchema,
  delayHours: z.number().int().min(1),
  body: z.string().trim().min(1).max(480),
});

export const NurtureMessageSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  leadId: UuidSchema,
  enrollmentId: UuidSchema,
  channel: NurtureMessageChannelSchema,
  status: NurtureMessageStatusSchema,
  stepIndex: z.number().int().min(0),
  body: z.string().trim().min(1).max(480).nullable(),
  blockReason: NurtureBlockReasonSchema.nullable(),
  providerMessageId: z.string().trim().min(1).nullable(),
  scheduledFor: IsoDateTimeSchema.nullable(),
  sentAt: IsoDateTimeSchema.nullable(),
  lastErrorCode: z.string().trim().min(1).nullable(),
  lastErrorMessage: z.string().trim().min(1).nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const NurtureMessageActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve_send") }),
  z.object({
    action: z.literal("dismiss"),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
  }),
]);

export const NurtureDeliveryReceiptRequestSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("sent"),
    providerMessageId: z.string().trim().min(1).max(255),
    sentAt: IsoDateTimeSchema.optional(),
  }),
  z.object({
    status: z.literal("failed"),
    errorCode: z.string().trim().min(1).max(120),
    errorMessage: z.string().trim().min(1).max(1000).nullable().optional(),
  }),
]);

export const NurtureDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("block"),
    reason: NurtureBlockReasonSchema,
    nextActionAt: IsoDateTimeSchema.nullable(),
  }),
  z.object({
    action: z.literal("draft"),
    step: NurtureStepSchema,
    nextActionAt: IsoDateTimeSchema.nullable(),
  }),
]);

export type NurtureEnrollmentStatus = z.infer<typeof NurtureEnrollmentStatusSchema>;
export type NurtureMessageChannel = z.infer<typeof NurtureMessageChannelSchema>;
export type NurtureMessageStatus = z.infer<typeof NurtureMessageStatusSchema>;
export type NurtureBlockReason = z.infer<typeof NurtureBlockReasonSchema>;
export type NurtureEnrollment = z.infer<typeof NurtureEnrollmentSchema>;
export type NurtureLeadContact = z.infer<typeof NurtureLeadContactSchema>;
export type NurtureStep = z.infer<typeof NurtureStepSchema>;
export type NurtureMessage = z.infer<typeof NurtureMessageSchema>;
export type NurtureMessageActionRequest = z.infer<typeof NurtureMessageActionRequestSchema>;
export type NurtureDeliveryReceiptRequest = z.infer<typeof NurtureDeliveryReceiptRequestSchema>;
export type NurtureDecision = z.infer<typeof NurtureDecisionSchema>;

export function isOptOutMessage(text: string): boolean {
  return /\b(stop|unsubscribe|cancel|quit|end)\b/i.test(text.trim());
}

function getLocalHour(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    timeZone,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");

  return Number.isFinite(hour) ? hour : date.getUTCHours();
}

export function isInsideQuietHours(params: {
  at: Date;
  timeZone: string;
  startHour?: number;
  endHour?: number;
}): boolean {
  const startHour = params.startHour ?? 20;
  const endHour = params.endHour ?? 8;
  const localHour = getLocalHour(params.at, params.timeZone);

  return startHour > endHour
    ? localHour >= startHour || localHour < endHour
    : localHour >= startHour && localHour < endHour;
}

export function nextQuietHourExit(params: {
  at: Date;
  timeZone: string;
  endHour?: number;
}): Date {
  const endHour = params.endHour ?? 8;
  const localHour = getLocalHour(params.at, params.timeZone);
  const hoursUntilExit = localHour < endHour
    ? endHour - localHour
    : (24 - localHour) + endHour;

  return new Date(params.at.getTime() + hoursUntilExit * 60 * 60 * 1000);
}

export function chooseNurtureChannel(lead: NurtureLeadContact): NurtureMessageChannel | null {
  if (lead.phone !== null) {
    return "sms";
  }
  if (lead.instagramUserId !== null && (lead.sourceChannel === "instagram_dm" || lead.sourceChannel === "instagram_comment")) {
    return "instagram_dm";
  }
  if (lead.instagramUserId !== null && (lead.sourceChannel === "facebook_dm" || lead.sourceChannel === "facebook_comment")) {
    return "facebook_dm";
  }

  return null;
}

export function buildDefaultNurtureStep(params: {
  index: number;
  channel: NurtureMessageChannel;
  lead: NurtureLeadContact;
}): NurtureStep | null {
  const namePrefix = params.lead.fullName === null ? "Hey" : `Hey ${params.lead.fullName.split(/\s+/)[0]}`;
  const steps = [
    `${namePrefix}, are you still looking around Houston or did you already find the right place?`,
    `${namePrefix}, I can send a tighter list if you tell me area, budget, and timeline.`,
    `${namePrefix}, checking in once more. Want me to have someone follow up with options that match what you asked for?`,
  ];
  const body = steps[params.index];
  if (body === undefined) {
    return null;
  }

  return NurtureStepSchema.parse({
    index: params.index,
    channel: params.channel,
    delayHours: params.index === 0 ? 24 : 48,
    body,
  });
}

export function decideNurtureAction(params: {
  enrollment: NurtureEnrollment;
  lead: NurtureLeadContact;
  now: Date;
}): NurtureDecision {
  if (params.enrollment.status === "opted_out" || params.enrollment.optedOutAt !== null) {
    return {
      action: "block",
      reason: "opted_out",
      nextActionAt: null,
    };
  }
  if (params.enrollment.status !== "active") {
    return {
      action: "block",
      reason: "sequence_complete",
      nextActionAt: null,
    };
  }
  if (isInsideQuietHours({ at: params.now, timeZone: params.enrollment.quietHoursTimezone })) {
    return {
      action: "block",
      reason: "quiet_hours",
      nextActionAt: nextQuietHourExit({ at: params.now, timeZone: params.enrollment.quietHoursTimezone }).toISOString(),
    };
  }

  const channel = chooseNurtureChannel(params.lead);
  if (channel === null) {
    return {
      action: "block",
      reason: "missing_contact",
      nextActionAt: null,
    };
  }

  const step = buildDefaultNurtureStep({
    index: params.enrollment.lastStepIndex,
    channel,
    lead: params.lead,
  });
  if (step === null) {
    return {
      action: "block",
      reason: "sequence_complete",
      nextActionAt: null,
    };
  }

  return {
    action: "draft",
    step,
    nextActionAt: new Date(params.now.getTime() + step.delayHours * 60 * 60 * 1000).toISOString(),
  };
}
